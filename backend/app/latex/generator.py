import asyncio
import os
import json
from app.core.logging import logger
from langchain_openai import ChatOpenAI
from app.core.config import settings

class LatexGenerator:
    """Generate resume into LaTeX using LLM and compile it to PDF."""

    def __init__(self):
        """Create a generator."""
        pass

    async def generate_pdf(self, resume_data: dict, output_dir: str, filename: str, jd_text: str = None) -> str:
        """Generate a resume using an LLM and compile it with `xelatex`.

        Returns the generated PDF path. Raises a generic generation exception
        after logging the original failure so API callers do not receive raw
        compiler output or filesystem details.
        """
        try:
            jd_instruction = ""
            if jd_text:
                jd_instruction = f"\nTarget Job Description:\n{jd_text}\n\nPlease tailor the presentation, emphasis, and layout of the resume to highlight the skills and experiences most relevant to this specific Job Description. Make it stand out for this exact role."

            from app.core.prompts import LATEX_GENERATOR_PROMPT
            
            prompt = LATEX_GENERATOR_PROMPT.format(
                jd_instruction=jd_instruction,
                resume_data=json.dumps(resume_data, indent=2)
            )
            
            llm = ChatOpenAI(model=settings.OPENAI_LATEX_MODEL, api_key=settings.OPENAI_API_KEY, max_tokens=4000)
            logger.info("Requesting LaTeX code from LLM...")
            response = await llm.ainvoke(prompt)
            
            latex_code = response.content
            
            # Extract LaTeX code from markdown block if present
            latex_code = latex_code.strip()
            if latex_code.startswith("```latex"):
                latex_code = latex_code[8:]
            elif latex_code.startswith("```tex"):
                latex_code = latex_code[6:]
            elif latex_code.startswith("```"):
                latex_code = latex_code[3:]
            if latex_code.endswith("```"):
                latex_code = latex_code[:-3]
            latex_code = latex_code.strip()
            
            tex_file_path = os.path.join(output_dir, f"{filename}.tex")
            pdf_file_path = os.path.join(output_dir, f"{filename}.pdf")
            
            with open(tex_file_path, "w") as f:
                f.write(latex_code)
                
            logger.info(f"Written LaTeX code to {tex_file_path}")
                
            process = await asyncio.create_subprocess_exec(
                "xelatex",
                "-interaction=nonstopmode",
                f"-output-directory={output_dir}",
                tex_file_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                stdout_text = stdout.decode()
                error_msg = f"LaTeX compilation failed. Stderr: {stderr.decode()} | Stdout snippet: {stdout_text[-1000:]}"
                logger.error(error_msg)
                raise Exception("LaTeX compilation failed")
                
            logger.info(f"Successfully generated PDF at {pdf_file_path}")
            return pdf_file_path
        except Exception as e:
            logger.error(f"Error during PDF generation: {str(e)}", exc_info=True)
            raise Exception("Failed to generate PDF document")
