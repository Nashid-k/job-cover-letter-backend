const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const HF_BASE_URL = process.env.HF_BASE_URL || 'https://router.huggingface.co/v1';
const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL = process.env.HF_MODEL || 'meta-llama/Llama-3.1-8B-Instruct:cerebras';
const MAX_TOKENS = parseInt(process.env.HF_MAX_TOKENS) || 1200;
const TEMPERATURE = parseFloat(process.env.HF_TEMPERATURE) || 0.7;
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 30000;

async function callHF(messages, max_tokens = MAX_TOKENS, temperature = TEMPERATURE) {
  try {
    const response = await axios.post(
      `${HF_BASE_URL}/chat/completions`,
      {
        model: HF_MODEL,
        messages,
        max_tokens,
        temperature,
      },
      {
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: API_TIMEOUT,
      }
    );
    return response.data.choices?.[0]?.message?.content;
  } catch (error) {
    console.error('HF API error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error(`AI service error: ${error.response?.data?.error || error.message}`);
  }
}

async function extractSkillsAI(text, isJob = false, userSchemaSkills = []) {
  const systemPrompt = 'Extract skills, qualifications, expertise, and soft skills comprehensively from the provided text. Ensure skills are specific and relevant to the context (job description or user profile). Output JSON: {"skills": ["skill1", "skill2", ...]}';
  const userPrompt = isJob
    ? `From this job description, extract all required skills, including technical, soft, and industry-specific skills:\n\n${text}`
    : `From this user profile, extract skills present in the provided schema (jobPreferences.skills, projects.technologies, experience.skills) or resume. Cross-check against: ${userSchemaSkills.join(', ') || 'None'}. Only include verified skills present in the schema or resume:\n\n${text}`;

  try {
    const content = await callHF([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], Math.floor(MAX_TOKENS / 2), TEMPERATURE / 2);

    const extractedSkills = JSON.parse(content).skills || [];
    return isJob ? extractedSkills : extractedSkills.filter(skill => 
      userSchemaSkills.some(schemaSkill => 
        schemaSkill.toLowerCase().includes(skill.toLowerCase()) || 
        skill.toLowerCase().includes(schemaSkill.toLowerCase())
      )
    );
  } catch (error) {
    console.error('Skill extraction failed:', error.message);
    return [];
  }
}

async function analyzeSchemaAlignmentAI(userProfileText, jobDescription, userProfile) {
  const systemPrompt = 'Analyze how each user schema detail (profession, jobPreferences, projects, experience, education, certifications) contributes to the job description, including transferable benefits. Skip missing or undefined fields. Output JSON: {"alignmentDetails": [{"schemaField": "fieldName", "detail": "value", "usefulness": "explanation"}]}';
  const userPrompt = `
User Profile: ${userProfileText}

Job Description: ${jobDescription}

Profession: ${userProfile.profession || 'Professional'}
Preferred Industries: ${(userProfile.jobPreferences?.preferredIndustries || []).join(', ') || 'None'}

For each available schema field (e.g., profession, each project, experience, education, certification), explain how it benefits the job, even indirectly (e.g., teamwork from a project applies to collaboration in the JD). Skip missing or undefined fields. Be comprehensive, truthful, and creative in identifying transferable value.
`;

  try {
    const content = await callHF([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], MAX_TOKENS, TEMPERATURE);

    return JSON.parse(content).alignmentDetails || [];
  } catch (error) {
    console.error('Schema alignment analysis failed:', error.message);
    return [];
  }
}

async function analyzeMatchAI(requiredSkills, userSkills, jobDescription, userProfileText, userExperience, userProfile) {
  const systemPrompt = 'Analyze job match based on skills, experience, and field alignment. Output JSON.';
  const userPrompt = `
Job Description: ${jobDescription}

Required Skills: ${(requiredSkills || []).join(', ') || 'None'}

User Skills: ${(userSkills || []).join(', ') || 'None'}

User Profile: ${userProfileText}

User Experience: ${userExperience.totalYears || 0} years, ${userExperience.positions || 0} positions

Profession: ${userProfile.profession || 'Professional'}
Preferred Industries: ${(userProfile.jobPreferences?.preferredIndustries || []).join(', ') || 'None'}
Education: ${(userProfile.education || []).map(e => `${e.degree || 'None'} in ${e.fieldOfStudy || 'None'} from ${e.institution || 'None'}`).join('; ') || 'None'}

Analyze alignment:
- Compute match score (0-100) based on skill overlap, experience relevance, and field alignment.
- List matched and missing skills.
- Provide recommendation: strong_match, good_match, partial_match, consider_with_caution, poor_match.
- Truthfulness score (0-100): feasibility of honest cover letter without exaggeration.
- Assume field compatibility by finding transferable skills or experiences, even for seemingly unrelated fields (e.g., engineering skills for a business role via problem-solving).

Output JSON: {
  "score": number,
  "matchedSkills": array,
  "missingSkills": array,
  "fieldCompatible": boolean,
  "reason": string,
  "recommendation": string,
  "truthfulnessScore": number
}
`;

  try {
    const content = await callHF([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], MAX_TOKENS, TEMPERATURE);

    const result = JSON.parse(content);
    return {
      score: result.score || 0,
      matchedSkills: result.matchedSkills || [],
      missingSkills: result.missingSkills || requiredSkills || [],
      fieldCompatible: result.fieldCompatible !== false,
      reason: result.reason || 'Transferable skills assumed',
      recommendation: result.recommendation || 'consider_with_caution',
      truthfulnessScore: result.truthfulnessScore || 50
    };
  } catch (error) {
    console.error('Job match analysis failed:', error.message);
    return {
      score: 0,
      matchedSkills: [],
      missingSkills: requiredSkills || [],
      fieldCompatible: true,
      reason: 'Analysis failed, transferable skills assumed',
      recommendation: 'consider_with_caution',
      truthfulnessScore: 50
    };
  }
}

function normalizeSkillsArray(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.filter(s => s && typeof s === 'string').map(s => s.trim());
  if (typeof skills === 'string') return skills.split(/[,;|]/).map(s => s.trim()).filter(s => s);
  return [];
}

function calculateUserExperience(userProfile) {
  const experience = Array.isArray(userProfile.experience) ? userProfile.experience : [];
  let totalMonths = 0;
  let validExperiences = 0;

  experience.forEach(exp => {
    if (exp?.startDate) {
      try {
        const start = new Date(exp.startDate);
        const end = exp.current || !exp.endDate || exp.endDate.toLowerCase() === 'present' ? new Date() : new Date(exp.endDate);
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
          totalMonths += Math.max(0, months);
          validExperiences++;
        }
      } catch (dateError) {
        console.warn('Invalid date in experience:', {
          position: exp.position || 'Unknown',
          startDate: exp.startDate,
          endDate: exp.endDate,
          error: dateError.message
        });
      }
    }
  });

  return {
    totalYears: Math.floor(totalMonths / 12),
    totalMonths,
    positions: validExperiences,
    hasDetailedExperience: validExperiences > 0
  };
}

async function analyzeJobMatch(jobDescription, userProfile) {
  if (!jobDescription || !userProfile) {
    return {
      score: 0,
      matchedSkills: [],
      missingSkills: [],
      requiredSkills: [],
      recommendation: 'insufficient_data',
      fieldCompatible: true,
      reason: 'Missing job description or user profile, transferable skills assumed',
      truthfulnessScore: 50,
      allUserSkills: [],
      userExperience: { totalYears: 0, totalMonths: 0, positions: 0, hasDetailedExperience: false },
      alignmentDetails: []
    };
  }

  try {
    const userExperience = calculateUserExperience(userProfile);
    const resumeContent = await extractResumeContent(userProfile.resumePath || '');

    const schemaSkills = [
      ...normalizeSkillsArray(userProfile.jobPreferences?.skills),
      ...(userProfile.projects || []).flatMap(p => normalizeSkillsArray(p.technologies)),
      ...(userProfile.experience || []).flatMap(e => normalizeSkillsArray(e.skills))
    ].filter((s, i, arr) => s && arr.indexOf(s) === i);

    const { name, email, profession, jobPreferences = {}, projects = [], experience = [], education = [], certifications = [] } = userProfile;
    const formattedProjects = projects.map(p => `- ${p.title || 'Project'}: ${p.description || ''} (Technologies: ${normalizeSkillsArray(p.technologies).join(', ') || 'None'})`).join('\n');
    const formattedExperience = experience.map(e => `- ${e.position || 'Role'} at ${e.company || 'Company'}: ${e.description || (e.achievements || []).join('; ') || ''} (Skills: ${normalizeSkillsArray(e.skills).join(', ') || 'None'})`).join('\n');
    const formattedEducation = education.map(e => `- ${e.degree || 'None'} in ${e.fieldOfStudy || 'None'} from ${e.institution || 'None'}`).join('\n');
    const formattedCertifications = certifications.map(c => `- ${c.name || 'None'} from ${c.issuer || 'None'} (${c.date || 'None'})`).join('\n');

    const userProfileText = `
Name: ${name || 'Candidate'}
Email: ${email || 'Not provided'}
Profession: ${profession || 'Professional'}
Job Preferences: 
  Title: ${jobPreferences.title || 'Not specified'}
  Location: ${jobPreferences.location || 'Not specified'}
  Remote: ${jobPreferences.remote ? 'Yes' : 'No'}
  Skills: ${normalizeSkillsArray(jobPreferences.skills).join(', ') || 'None'}
  Preferred Industries: ${(jobPreferences.preferredIndustries || []).join(', ') || 'None'}
Education:
${formattedEducation || 'None provided'}
Certifications:
${formattedCertifications || 'None provided'}
Projects:
${formattedProjects || 'None provided'}
Experience:
${formattedExperience || 'None provided'}
Resume:
${resumeContent || 'None provided'}
`;

    const requiredSkills = await extractSkillsAI(jobDescription, true);
    const userSkills = await extractSkillsAI(userProfileText, false, schemaSkills);
    const alignmentDetails = await analyzeSchemaAlignmentAI(userProfileText, jobDescription, userProfile);
    const aiAnalysis = await analyzeMatchAI(requiredSkills, userSkills, jobDescription, userProfileText, userExperience, userProfile);

    return {
      ...aiAnalysis,
      requiredSkills,
      allUserSkills: userSkills,
      userExperience,
      alignmentDetails
    };
  } catch (error) {
    console.error('Job match analysis error:', error.message);
    return {
      score: 0,
      matchedSkills: [],
      missingSkills: [],
      requiredSkills: [],
      recommendation: 'error',
      fieldCompatible: true,
      reason: 'Analysis failed due to error',
      truthfulnessScore: 50,
      allUserSkills: [],
      userExperience: { totalYears: 0, totalMonths: 0, positions: 0, hasDetailedExperience: false },
      alignmentDetails: []
    };
  }
}

exports.generateCoverLetter = async ({ jobDescription, userProfile, analysis = null }) => {
  try {
    const skillsAnalysis = analysis || await analyzeJobMatch(jobDescription, userProfile);

    skillsAnalysis.allUserSkills = skillsAnalysis.allUserSkills || [];
    skillsAnalysis.matchedSkills = skillsAnalysis.matchedSkills || [];
    skillsAnalysis.missingSkills = skillsAnalysis.missingSkills || [];
    skillsAnalysis.requiredSkills = skillsAnalysis.requiredSkills || [];
    skillsAnalysis.alignmentDetails = skillsAnalysis.alignmentDetails || [];
    skillsAnalysis.userExperience = skillsAnalysis.userExperience || { totalYears: 0, totalMonths: 0, positions: 0, hasDetailedExperience: false };

    const resumeContent = await extractResumeContent(userProfile.resumePath || '');
    const { name, email, profession, jobPreferences = {}, projects = [], experience = [], education = [], certifications = [] } = userProfile;

    const formattedProjects = projects.map(p => `- ${p.title || 'Project'}: ${p.description || ''} (Technologies: ${normalizeSkillsArray(p.technologies).join(', ') || 'None'})`).join('\n');
    const formattedExperience = experience.map(e => `- ${e.position || 'Role'} at ${e.company || 'Company'}: ${e.description || (e.achievements || []).join('; ') || ''} (Skills: ${normalizeSkillsArray(e.skills).join(', ') || 'None'})`).join('\n');
    const formattedEducation = education.map(e => `- ${e.degree || 'None'} in ${e.fieldOfStudy || 'None'} from ${e.institution || 'None'}`).join('\n');
    const formattedCertifications = certifications.map(c => `- ${c.name || 'None'} from ${c.issuer || 'None'} (${c.date || 'None'})`).join('\n');

    const candidateInfo = `
Name: ${name || 'Candidate'}
Email: ${email || 'Not provided'}
Profession: ${profession || 'Professional'}
Job Preferences: ${jobPreferences.title || 'Not specified'}, ${jobPreferences.location || 'Not specified'}, Remote: ${jobPreferences.remote ? 'Yes' : 'No'}
Preferred Industries: ${(jobPreferences.preferredIndustries || []).join(', ') || 'None'}
Skills (Preferences): ${normalizeSkillsArray(jobPreferences.skills).join(', ') || 'None'}
Verified Skills: ${skillsAnalysis.allUserSkills.join(', ') || 'None'}
Matched Skills: ${skillsAnalysis.matchedSkills.join(', ') || 'None'}
Missing Skills: ${skillsAnalysis.missingSkills.join(', ') || 'None'}
Education: ${formattedEducation || 'None'}
Certifications: ${formattedCertifications || 'None'}
Projects: ${formattedProjects || 'None'}
Experience: ${formattedExperience || 'None'}
Resume: ${resumeContent || 'None'}
Total Experience: ${skillsAnalysis.userExperience.totalYears || 0} years
`;

    const systemPrompt = `You are an expert cover letter writer. Create an outstanding, professional, and broadly appealing cover letter (300-400 words) that uses verified skills and experiences from the user profile. Highlight matched skills, creatively explain how each schema detail (e.g., projects, experience) benefits the job, and adapt tone to the job's field and candidate's experience level. Avoid niche jargon, unverified skills, and focus on enthusiasm, authenticity, and transferable value. Handle missing fields gracefully by focusing on available data.`;

    const userPrompt = `
Job Description:
${jobDescription}

Candidate Profile:
${candidateInfo}

Analysis:
- Match Score: ${skillsAnalysis.score}%
- Matched Skills: ${skillsAnalysis.matchedSkills.length} of ${skillsAnalysis.requiredSkills.length}
- Missing Skills: ${skillsAnalysis.missingSkills.join(', ') || 'None'}
- Recommendation: ${skillsAnalysis.recommendation}
- Field Compatible: ${skillsAnalysis.fieldCompatible}
- Truthfulness Score: ${skillsAnalysis.truthfulnessScore}%
- Alignment Details: ${JSON.stringify(skillsAnalysis.alignmentDetails)}

Generate an outstanding cover letter that blends the candidate's verified skills, experience, education, and certifications with the job requirements. Use alignment details to highlight how each schema element contributes (e.g., a project's teamwork for collaboration). Address missing skills by emphasizing related experience or learning potential (e.g., REST API experience for GraphQL). Ensure enthusiasm and broad appeal.
`;

    const content = await callHF([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    if (!content) throw new Error('No cover letter content generated');

    return {
      coverLetter: content,
      analysis: skillsAnalysis,
      recommendation: {
        action: 'proceed',
        truthfulnessScore: skillsAnalysis.truthfulnessScore,
        matchQuality: skillsAnalysis.recommendation,
        skillsHighlighted: skillsAnalysis.matchedSkills
      }
    };
  } catch (error) {
    console.error('Cover letter generation error:', {
      message: error.message,
      stack: error.stack
    });
    throw new Error(`Cover letter generation failed: ${error.message}`);
  }
};

async function extractResumeContent(resumePath) {
  if (!resumePath || !fs.existsSync(resumePath)) return '';
  const ext = path.extname(resumePath).toLowerCase();
  if (ext === '.pdf') return await extractPdfText(resumePath);
  if (ext === '.docx' || ext === '.doc') return await extractDocxText(resumePath);
  return '';
}

async function extractPdfText(resumePath) {
  try {
    const buffer = fs.readFileSync(resumePath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF parsing error:', {
      file: resumePath,
      error: error.message
    });
    return '';
  }
}

async function extractDocxText(resumePath) {
  try {
    const result = await mammoth.extractRawText({ path: resumePath });
    return result.value;
  } catch (error) {
    console.error('DOCX parsing error:', {
      file: resumePath,
      error: error.message
    });
    return '';
  }
}

exports.analyzeJobMatch = analyzeJobMatch;