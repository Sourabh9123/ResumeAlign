import asyncio
import ipaddress
import re
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx

from app.core.config import settings


class JobDescriptionFetchError(ValueError):
    """Raised when a job description URL cannot be safely fetched or parsed."""


class _ReadableHtmlParser(HTMLParser):
    """Extract visible text from common HTML job posting pages."""

    _BLOCK_TAGS = {
        "article",
        "br",
        "dd",
        "div",
        "dt",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "li",
        "main",
        "p",
        "section",
        "td",
        "th",
        "tr",
    }
    _IGNORED_TAGS = {"noscript", "script", "style", "svg", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._ignored_depth = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag in self._IGNORED_TAGS:
            self._ignored_depth += 1
            return
        if tag in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._IGNORED_TAGS and self._ignored_depth:
            self._ignored_depth -= 1
            return
        if tag in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        text = data.strip()
        if text:
            self._parts.append(text)

    def text(self) -> str:
        return _normalize_text(" ".join(self._parts))


def _normalize_text(text: str) -> str:
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_text(body: str, content_type: str) -> str:
    content_type = content_type.lower()
    if "html" not in content_type and not re.search(
        r"<\s*html|<\s*body|<\s*main|<\s*article", body, re.I
    ):
        return _normalize_text(body)

    parser = _ReadableHtmlParser()
    parser.feed(body)
    return parser.text()


def _validate_url_shape(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise JobDescriptionFetchError(
            "Job description link must start with http:// or https://."
        )
    if not parsed.hostname:
        raise JobDescriptionFetchError("Job description link must include a valid host.")
    return parsed.geturl()


def _is_blocked_ip(raw_ip: str) -> bool:
    ip = ipaddress.ip_address(raw_ip)
    return any(
        (
            ip.is_loopback,
            ip.is_link_local,
            ip.is_multicast,
            ip.is_private,
            ip.is_reserved,
            ip.is_unspecified,
        )
    )


async def _validate_public_host(url: str) -> None:
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise JobDescriptionFetchError("Job description link must include a valid host.")

    try:
        if _is_blocked_ip(hostname):
            raise JobDescriptionFetchError(
                "Job description link points to a private or local address."
            )
        return
    except ValueError:
        pass

    loop = asyncio.get_running_loop()
    try:
        addr_infos = await loop.getaddrinfo(
            hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=0,
        )
    except OSError as exc:
        raise JobDescriptionFetchError(
            "Could not resolve the job description link."
        ) from exc

    for addr_info in addr_infos:
        raw_ip = addr_info[4][0]
        if _is_blocked_ip(raw_ip):
            raise JobDescriptionFetchError(
                "Job description link resolves to a private or local address."
            )


async def fetch_job_description_text(url: str) -> str:
    """Fetch and extract readable text from a public job posting URL."""
    current_url = _validate_url_shape(url)
    timeout = httpx.Timeout(settings.JD_URL_FETCH_TIMEOUT_SECONDS)
    headers = {
        "Accept": "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.2",
        "User-Agent": "ResumeBuilderBot/1.0 (+https://localhost)",
    }

    async with httpx.AsyncClient(
        timeout=timeout, follow_redirects=False, headers=headers
    ) as client:
        for _ in range(4):
            await _validate_public_host(current_url)
            try:
                response = await client.get(current_url)
            except httpx.HTTPError as exc:
                raise JobDescriptionFetchError(
                    "Could not fetch the job description link."
                ) from exc

            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise JobDescriptionFetchError(
                        "Job description link redirected without a destination."
                    )
                current_url = _validate_url_shape(urljoin(current_url, location))
                continue

            if response.status_code >= 400:
                raise JobDescriptionFetchError(
                    f"Job description link returned HTTP {response.status_code}."
                )

            text = _extract_text(
                response.text[: settings.JD_URL_MAX_CHARS * 4],
                response.headers.get("content-type", ""),
            )
            text = text[: settings.JD_URL_MAX_CHARS]
            if len(text) < settings.JD_URL_MIN_TEXT_CHARS:
                raise JobDescriptionFetchError(
                    "Could not extract enough job description text from the link."
                )
            return text

    raise JobDescriptionFetchError("Job description link redirected too many times.")
