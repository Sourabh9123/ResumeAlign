import asyncio
import os
from jinja2 import Template

class LatexGenerator:
    def __init__(self, template_path: str = "app/latex/templates/default.tex"):
        self.template_path = template_path

    async def generate_pdf(self, resume_data: dict, output_dir: str, filename: str) -> str:
        # Load Template
        with open(self.template_path, 'r') as f:
            template_content = f.read()
        
        template = Template(template_content)
        latex_code = template.render(resume=resume_data)
        
        tex_file_path = os.path.join(output_dir, f"{filename}.tex")
        pdf_file_path = os.path.join(output_dir, f"{filename}.pdf")
        
        with open(tex_file_path, "w") as f:
            f.write(latex_code)
            
        # Run xelatex via asyncio subprocess
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
            raise Exception(f"LaTeX compilation failed: {stderr.decode()}")
            
        return pdf_file_path
