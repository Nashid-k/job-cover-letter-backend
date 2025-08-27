const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const HF_BASE_URL = 'https://router.huggingface.co/v1';
const HF_TOKEN = process.env.HF_TOKEN;


async function extractResumeContent(resumePath) {
  if (!resumePath || !fs.existsSync(resumePath)) return '';
  const ext = path.extname(resumePath).toLowerCase();
  return ext === '.pdf'
    ? await extractPdfText(resumePath)
    : ext === '.docx' || ext === '.doc'
    ? await extractDocxText(resumePath)
    : '';
}

async function extractPdfText(resumePath) {
  try {
    const buffer = fs.readFileSync(resumePath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (e) {
    console.error('PDF parsing error:', e);
    return '';
  }
}

async function extractDocxText(resumePath) {
  try {
    const result = await mammoth.extractRawText({ path: resumePath });
    return result.value;
  } catch (e) {
    console.error('DOCX parsing error:', e);
    return '';
  }
}

exports.generateCoverLetter = async ({ jobDescription, userProfile }) => {
  try {
    const { name, email, jobPreferences = {}, resumePath, projects = [], experience = [] } = userProfile;
    let resumeContent = '';
    if (resumePath) resumeContent = await extractResumeContent(resumePath);


    const formattedProjects = projects.map(proj => 
      `- ${proj.title}: ${proj.description} ${proj.technologies.length > 0 ? 
        `(Technologies: ${proj.technologies.join(', ')})` : ''}`
    ).join('\n');


    const formattedExperience = experience.map(exp => 
      `- ${exp.position} at ${exp.company}: ${exp.description || ''} ${exp.achievements.length > 0 ? 
        `(Achievements: ${exp.achievements.join(', ')})` : ''}`
    ).join('\n');

    const candidateInfo = `
Name: ${name || 'N/A'}
Email: ${email || 'N/A'}
Title: ${jobPreferences.title || 'N/A'}
Location: ${jobPreferences.location || 'N/A'}
Remote: ${jobPreferences.remote ? 'Yes' : 'No'}
Skills: ${Array.isArray(jobPreferences.skills) ? jobPreferences.skills.join(', ') : jobPreferences.skills || 'N/A'}

KEY PROJECTS:
${formattedProjects || 'N/A'}

PROFESSIONAL EXPERIENCE:
${formattedExperience || 'N/A'}
`;

    const systemPrompt = `You are an expert cover letter writer with 15+ years of experience in HR and recruitment. 
Create a highly personalized, ATS-optimized cover letter (300-400 words) that:
1. Starts with a strong, engaging opening that shows genuine interest in the specific company/role
2. Highlights the most relevant 2-3 projects and experiences that match the job requirements
3. Uses quantifiable achievements and specific examples
4. Demonstrates cultural fit and enthusiasm for the company's mission
5. Ends with a confident call to action
6. Maintains a professional yet conversational tone

Focus on creating a narrative that connects the candidate's unique background to the specific role.`;

    const userPrompt = `
JOB OPPORTUNITY:
${jobDescription}

CANDIDATE PROFILE:
${candidateInfo}

Please create a cover letter that specifically references their projects and experience, using concrete examples and metrics where possible. Tailor it to this specific job opportunity.
`;

    const response = await axios.post(
      `${HF_BASE_URL}/chat/completions`,
      {
        model: 'meta-llama/Llama-3.1-8B-Instruct:cerebras',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1200,
        temperature: 0.8,
      },
      {
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No cover letter content generated');
    return content;
  } catch (error) {
    console.error('Cover letter generation error:', error.response?.data || error.message);
    if (error.response?.status === 401) throw new Error('Invalid API token.');
    if (error.response?.status === 429) throw new Error('Rate limit exceeded.');
    throw new Error('Failed to generate cover letter.');
  }
};