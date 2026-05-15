import asyncio
import os
from jinja2 import Template
from app.core.logging import logger

class LatexGenerator:
    """Render resume data into LaTeX and compile it to PDF."""

    def __init__(self, template_path: str = "app/latex/templates/default.tex"):
        """Create a generator using the given Jinja-compatible LaTeX template."""
        self.template_path = template_path

    async def generate_pdf(self, resume_data: dict, output_dir: str, filename: str) -> str:
        """Render a resume template and compile it with `xelatex`.

        Returns the generated PDF path. Raises a generic generation exception
        after logging the original failure so API callers do not receive raw
        compiler output or filesystem details.
        """
        try:
            with open(self.template_path, 'r') as f:
                template_content = f.read()
            
            template = Template(template_content)
            latex_code = template.render(resume=resume_data)
            
            tex_file_path = os.path.join(output_dir, f"{filename}.tex")
            pdf_file_path = os.path.join(output_dir, f"{filename}.pdf")
            
            with open(tex_file_path, "w") as f:
                f.write(latex_code)
                
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
                error_msg = f"LaTeX compilation failed: {stderr.decode()}"
                logger.error(error_msg)
                raise Exception(error_msg)
                
            logger.info(f"Successfully generated PDF at {pdf_file_path}")
            return pdf_file_path
        except Exception as e:
            logger.error(f"Error during PDF generation: {str(e)}", exc_info=True)
            raise Exception("Failed to generate PDF document")
