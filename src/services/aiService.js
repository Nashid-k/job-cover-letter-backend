const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const nlp = require('compromise'); // lightweight NLP
const { default: spacyNLP } = require('@nlpjs/lang-en'); // optional spaCy wrapper if using Python via API

const HF_BASE_URL = "https://router.huggingface.co/v1";
const HF_TOKEN = process.env.HF_TOKEN;

// Extract raw text from PDFs
async function extractPdfText(resumePath) {
  try {
    const dataBuffer = fs.readFileSync(resumePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (err) {
    console.error('PDF parsing error:', err);
    return '';
  }
}

// Extract raw text from DOC/DOCX
async function extractDocxText(resumePath) {
  try {
    const result = await mammoth.extractRawText({ path: resumePath });
    return result.value;
  } catch (err) {
    console.error('DOCX parsing error:', err);
    return '';
  }
}

// Detect file type and extract
async function extractResumeContent(resumePath) {
  if (!resumePath || !fs.existsSync(resumePath)) return '';
  const ext = path.extname(resumePath).toLowerCase();
  if (ext === '.pdf') {
    return await extractPdfText(resumePath);
  } else if (ext === '.doc' || ext === '.docx') {
    return await extractDocxText(resumePath);
  }
  return '';
}

// Simple NLP parser to extract sections
function parseResumeSections(text) {
  if (!text) return {};

  const lower = text.toLowerCase();
  const sections = {};

  // Split by common headers
  const parts = lower.split(/\n(?=[A-Z][a-z]+)/g);

  parts.forEach(p => {
    if (p.includes('experience')) sections.experience = p;
    else if (p.includes('project')) sections.projects = p;
    else if (p.includes('education')) sections.education = p;
    else if (p.includes('skill')) sections.skills = p;
    else if (p.includes('achievement') || p.includes('award')) sections.achievements = p;
  });

  // Cleanup
  Object.keys(sections).forEach(key => {
    sections[key] = sections[key]
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  });

  return sections;
}

exports.generateCoverLetter = async ({ jobDescription, userProfile }) => {
  try {
    console.log('Generating NLP-enhanced cover letter...');

    const { name, email, jobPreferences = {}, resumePath } = userProfile;

    let resumeContent = '';
    if (resumePath) {
      resumeContent = await extractResumeContent(resumePath);
    }

    // Parse resume into structured sections
    const parsedSections = parseResumeSections(resumeContent);

    // Fallbacks
    const skills = Array.isArray(jobPreferences.skills)
      ? jobPreferences.skills.join(', ')
      : jobPreferences.skills || parsedSections.skills || 'Not specified';

    const candidateInfo = `
Name: ${name || 'Not provided'}
Email: ${email || 'Not provided'}
Preferred Job Title: ${jobPreferences.title || 'Not specified'}
Preferred Location: ${jobPreferences.location || 'Not specified'}
Open to Remote Work: ${jobPreferences.remote ? 'Yes' : 'No'}

=== EXTRACTED RESUME DATA ===
Experience: ${parsedSections.experience || 'Not provided'}
Projects: ${parsedSections.projects || 'Not provided'}
Education: ${parsedSections.education || 'Not provided'}
Skills: ${skills}
Achievements: ${parsedSections.achievements || 'Not provided'}
`;

    const systemPrompt = `You are a professional cover letter writer who crafts ATS-optimized, personalized cover letters. 
Use structured sections below and mirror job keywords. 
Keep tone professional, engaging, and clear (300-400 words).`;

    const userPrompt = `
Job Description:
${jobDescription}

Candidate Profile:
${candidateInfo}

Write a polished, ATS-friendly cover letter highlighting relevant projects, skills, and experiences. Include greeting and closing.
`;

    const response = await axios.post(`${HF_BASE_URL}/chat/completions`, {
      model: "meta-llama/Llama-3.1-8B-Instruct:cerebras",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 900,
      temperature: 0.7,
    }, {
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const generatedCoverLetter = response.data.choices[0]?.message?.content;
    if (!generatedCoverLetter) throw new Error('No cover letter content generated');

    console.log('Cover letter generated successfully.');
    return generatedCoverLetter;

  } catch (error) {
    console.error('Cover letter generation error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    if (error.response?.status === 401) throw new Error('Invalid API token.');
    if (error.response?.status === 403) throw new Error('Access denied.');
    if (error.response?.status === 429) throw new Error('Rate limit exceeded.');
    if (error.response?.status === 503) throw new Error('Service temporarily unavailable.');

    throw new Error('Failed to generate cover letter. Please try again.');
  }
};
