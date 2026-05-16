import logging
from typing import AsyncIterator, Optional
from urllib.parse import unquote, urlparse

import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


class S3ClientFactory:
    """Build configured async S3 clients for storage and presigned URL helpers."""

    def __init__(self) -> None:
        """Create an S3 session using credentials and region from application settings."""
        self.session = aioboto3.Session(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        self.bucket_name = settings.AWS_S3_BUCKET
        self.client_config = Config(
            region_name=settings.AWS_REGION,
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
        )

    def is_configured(self) -> bool:
        """Return whether the minimum S3 settings are present."""
        return bool(self.bucket_name and settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY and settings.AWS_REGION)

    def client(self):
        """Return an async context manager for an S3 client."""
        return self.session.client("s3", config=self.client_config)


class S3StorageService:
    """Upload generated resume artifacts to a private S3 bucket."""

    def __init__(self, client_factory: Optional[S3ClientFactory] = None) -> None:
        """Create a storage service with a shared S3 client factory."""
        self.client_factory = client_factory or S3ClientFactory()
        self.bucket_name = self.client_factory.bucket_name

    async def upload_file(self, file_path: str, object_name: str) -> bool:
        """Upload a local file to the configured S3 bucket.

        Args:
            file_path: Absolute path to the local file.
            object_name: S3 object key to create.

        Returns:
            True when the upload succeeds, otherwise False.
        """
        if not self.client_factory.is_configured():
            logger.warning("S3 credentials or bucket not configured. Skipping upload.")
            return False

        try:
            async with self.client_factory.client() as s3_client:
                await s3_client.upload_file(file_path, self.bucket_name, object_name)
                logger.info(f"Successfully uploaded {file_path} to {self.bucket_name}/{object_name}")
                return True
        except ClientError as e:
            logger.error(f"Failed to upload file to S3: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error uploading to S3: {e}")
            return False


class S3PresignedUrlService:
    """Generate short-lived URLs for objects in a private S3 bucket."""

    def __init__(self, client_factory: Optional[S3ClientFactory] = None) -> None:
        """Create a presigned URL service with a shared S3 client factory."""
        self.client_factory = client_factory or S3ClientFactory()
        self.bucket_name = self.client_factory.bucket_name

    async def generate_presigned_url(self, object_name: str, expiration: int = 3600, download_filename: Optional[str] = None) -> Optional[str]:
        """Generate a fresh presigned GET URL for an S3 object key.

        Args:
            object_name: S3 object key to sign.
            expiration: Number of seconds the URL should remain valid.
            download_filename: Optional filename browsers should use when saving.

        Returns:
            A presigned URL string, or None when S3 is not configured or signing fails.
        """
        if not self.client_factory.is_configured():
            logger.warning("S3 credentials or bucket not configured. Cannot generate presigned URL.")
            return None

        try:
            async with self.client_factory.client() as s3_client:
                params = {"Bucket": self.bucket_name, "Key": object_name}
                if download_filename:
                    params["ResponseContentDisposition"] = f'attachment; filename="{download_filename}"'
                response = await s3_client.generate_presigned_url(
                    "get_object",
                    Params=params,
                    ExpiresIn=expiration,
                )
                return response
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error generating presigned URL: {e}")
            return None

    def object_key_from_url(self, url: Optional[str]) -> Optional[str]:
        """Extract an S3 object key from a virtual-hosted or path-style S3 URL.

        Args:
            url: S3 object URL or presigned URL.

        Returns:
            The decoded object key when it can be inferred, otherwise None.
        """
        if not url:
            return None

        parsed = urlparse(url)
        if not parsed.path:
            return None

        path = parsed.path.lstrip("/")
        if not path:
            return None

        if parsed.netloc.startswith(f"{self.bucket_name}."):
            return unquote(path)

        bucket_prefix = f"{self.bucket_name}/"
        if path.startswith(bucket_prefix):
            return unquote(path[len(bucket_prefix) :])

        return unquote(path)


class S3DownloadService:
    """Read private S3 objects so the API can stream them without exposing S3 URLs."""

    def __init__(self, client_factory: Optional[S3ClientFactory] = None) -> None:
        """Create a download service with a shared S3 client factory."""
        self.client_factory = client_factory or S3ClientFactory()
        self.bucket_name = self.client_factory.bucket_name

    async def iter_object(self, object_name: str, chunk_size: int = 1024 * 1024) -> AsyncIterator[bytes]:
        """Yield an S3 object's bytes in chunks.

        Args:
            object_name: S3 object key to read.
            chunk_size: Maximum bytes to read per chunk.

        Yields:
            Byte chunks from the private S3 object.

        Raises:
            RuntimeError: When S3 is not configured.
            ClientError: When S3 rejects or cannot find the object.
        """
        if not self.client_factory.is_configured():
            raise RuntimeError("S3 is not configured.")

        async with self.client_factory.client() as s3_client:
            response = await s3_client.get_object(Bucket=self.bucket_name, Key=object_name)
            body = response["Body"]
            try:
                while True:
                    chunk = await body.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
            finally:
                body.close()


class S3Service:
    """Backward-compatible facade for S3 upload and presigned URL generation."""

    def __init__(self) -> None:
        """Create upload and presigned URL helpers backed by one client factory."""
        client_factory = S3ClientFactory()
        self.storage = S3StorageService(client_factory)
        self.presigned_urls = S3PresignedUrlService(client_factory)
        self.downloads = S3DownloadService(client_factory)

    async def upload_file(self, file_path: str, object_name: str) -> bool:
        """Upload a local file to S3 using the storage service."""
        return await self.storage.upload_file(file_path, object_name)

    async def generate_presigned_url(self, object_name: str, expiration: int = 3600, download_filename: Optional[str] = None) -> Optional[str]:
        """Generate a short-lived GET URL for an S3 object key."""
        return await self.presigned_urls.generate_presigned_url(object_name, expiration, download_filename)

    def object_key_from_url(self, url: Optional[str]) -> Optional[str]:
        """Extract an object key from an S3 URL for legacy saved records."""
        return self.presigned_urls.object_key_from_url(url)

    async def iter_object(self, object_name: str, chunk_size: int = 1024 * 1024) -> AsyncIterator[bytes]:
        """Yield an S3 object's bytes in chunks."""
        async for chunk in self.downloads.iter_object(object_name, chunk_size):
            yield chunk
