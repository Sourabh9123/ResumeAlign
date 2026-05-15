from langchain.prompts import PromptTemplate

PARSE_RESUME_PROMPT = PromptTemplate(
    input_variables=["raw_text"],
    template="""You are an expert resume parser and data extractor.
Given the following raw text from a resume, extract the structured information and return it as a valid JSON object.
Do NOT include any markdown formatting, backticks, or extra text. Just the raw JSON.

The JSON should have the following structure:
{{
  "personal_info": {{
    "name": "Full Name",
    "email": "Email Address",
    "phone": "Phone Number",
    "location": "Location",
    "links": ["https://linkedin.com/in/...", "https://github.com/..."]
  }},
  "summary": "Professional Summary",
  "experience": [
    {{
      "company": "Company Name",
      "title": "Job Title",
      "start_date": "MM/YYYY",
      "end_date": "MM/YYYY or Present",
      "description": "Description of responsibilities and achievements"
    }}
  ],
  "education": [
    {{
      "institution": "Institution Name",
      "degree": "Degree Earned",
      "graduation_date": "MM/YYYY"
    }}
  ],
  "skills": ["Skill 1", "Skill 2"]
}}

Raw Resume Text:
{raw_text}
"""
)

ANALYZE_JD_PROMPT = PromptTemplate(
    input_variables=["jd_text"],
    template="""You are an expert technical recruiter and ATS specialist.
Analyze the following Job Description (JD) and extract the most critical information needed to tailor a resume.
Return the output strictly as a valid JSON object without any markdown formatting.

The JSON should have the following structure:
{{
  "job_title": "Target Job Title",
  "core_skills": ["Skill 1", "Skill 2"],
  "soft_skills": ["Skill 1", "Skill 2"],
  "required_experience_years": "Number or range",
  "key_responsibilities": ["Resp 1", "Resp 2"]
}}

Job Description:
{jd_text}
"""
)

OPTIMIZE_RESUME_PROMPT = PromptTemplate(
    input_variables=["structured_resume", "jd_analysis"],
    template="""You are an expert resume writer and ATS optimization engine.
Your goal is to tailor the provided structured resume to perfectly match the provided Job Description (JD) analysis.

Rules:
1. ONLY modify the 'summary' and 'description' fields within the 'experience' section to better align with the JD's keywords and responsibilities.
2. DO NOT hallucinate or invent new experience. Reword existing experience to highlight relevance.
3. Incorporate the core skills and soft skills naturally into the text.
4. Keep the original JSON structure completely intact.
5. Return ONLY a valid JSON object without markdown formatting.

Job Description Analysis:
{jd_analysis}

Original Structured Resume:
{structured_resume}
"""
)
