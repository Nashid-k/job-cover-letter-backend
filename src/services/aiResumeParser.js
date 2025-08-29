const axios = require('axios');

// Use a more reliable model that's available on Hugging Face
const HF_BASE_URL = "https://api-inference.huggingface.co/models/microsoft/DialoGPT-large";
const HF_TOKEN = process.env.HF_TOKEN;

// Alternative: Use OpenAI API if available (uncomment if you have OpenAI API key)
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Call Hugging Face API using axios with fallback
 */
async function hfCall(prompt) {
  try {
    // Try a smaller, more available model first
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/gpt2",
      { 
        inputs: prompt,
        parameters: {
          max_length: 1000,
          temperature: 0.3
        }
      },
      {
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 15000 // 15 second timeout
      }
    );

    const data = response.data;

    if (Array.isArray(data) && data[0]?.generated_text) {
      return data[0].generated_text;
    } else if (typeof data === 'string') {
      return data;
    }
    
    console.warn("⚠️ AI returned unexpected format:", data);
    return "";
  } catch (err) {
    console.error("❌ HF API Error:", err.message);
    if (err.response) {
      console.error("❌ Response status:", err.response.status);
      console.error("❌ Response data:", err.response.data);
    }
    return "";
  }
}

/**
 * Simple resume extraction without complex AI
 */
async function simpleResumeExtraction(rawText) {
  const detectedProfession = detectProfession(rawText);
  
  // Extract basic information using regex patterns
  const emailMatch = rawText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  const nameMatch = rawText.match(/(?:^|\n)[A-Z][a-z]+ [A-Z][a-z]+/);
  
  // Extract skills using pattern matching
  const skills = extractSkillsFromText(rawText, detectedProfession);
  const normalizedSkills = validateAndNormalizeSkills(skills, rawText);
  
  // Extract job title from common patterns
  const title = extractJobTitle(rawText);
  
  // Extract location if available
  const location = extractLocation(rawText);
  
  return {
    profession: detectedProfession,
    name: nameMatch ? nameMatch[0].trim() : "",
    email: emailMatch ? emailMatch[0] : "",
    jobPreferences: {
      title: title,
      location: location,
      skills: normalizedSkills,
      remote: false,
      preferredIndustries: []
    },
    projects: [],
    experience: [],
    education: [],
    certifications: []
  };
}

/**
 * Extract job title from text
 */
function extractJobTitle(text) {
  const titlePatterns = [
    /(?:^|\n)(?:Senior|Junior|Lead|Principal)?\s*(Software|Frontend|Backend|Full.?Stack|Web|Mobile|DevOps|Data|QA|Test|UX|UI)?\s*(Engineer|Developer|Programmer|Designer|Analyst|Architect|Specialist)/i,
    /(?:Position|Title|Role)[:\s]*([^\n]+)/i,
    /(?:^|\n)[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*[-–]\s*([^\n]+)/i
  ];
  
  for (const pattern of titlePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return "";
}

/**
 * Extract location from text
 */
function extractLocation(text) {
  const locationPatterns = [
    /(?:Location|Address|Based in)[:\s]*([^\n]+)/i,
    /(?:^|\n)(?:Remote|On-site|Hybrid|[\w\s]+,?\s*(?:CA|NY|TX|FL|IL|PA|OH|GA|NC|MI|NJ|VA|WA|AZ|MA|IN|TN|MO|MD|WI|MN|CO|AL|SC|LA|KY|OR|OK|CT|IA|MS|AR|UT|NV|NM|WV|NE|ID|HI|ME|NH|RI|MT|DE|SD|AK|ND|VT|WY|DC))[,\s]*/i
  ];
  
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return "";
}

/**
 * Profession-aware skill extraction with enhanced prompting
 */
async function extractResume(rawText) {
  // If we don't have a valid API key or the model is unavailable, use simple extraction
  if (!HF_TOKEN) {
    console.log("⚠️ No HF token available, using simple extraction");
    return simpleResumeExtraction(rawText);
  }

  const prompt = `
Extract information from this resume in JSON format. Focus on:
- Profession/role
- Name and email
- Job title preferences
- Skills (technical and professional)
- Location preference

Return ONLY valid JSON with this structure:
{
  "profession": "detected profession",
  "name": "full name",
  "email": "email address",
  "jobPreferences": {
    "title": "job title",
    "location": "location",
    "skills": ["skill1", "skill2", "skill3"],
    "remote": false,
    "preferredIndustries": []
  }
}

Resume Text:
${rawText.substring(0, 2000)}
  `;

  try {
    const output = await hfCall(prompt);
    
    if (!output) {
      console.error("❌ Empty response from AI, using simple extraction");
      return simpleResumeExtraction(rawText);
    }

    // Try to find JSON in the response
    const jsonStart = output.indexOf("{");
    const jsonEnd = output.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error("❌ No JSON found in AI response, using simple extraction");
      return simpleResumeExtraction(rawText);
    }

    const jsonStr = output.slice(jsonStart, jsonEnd + 1);
    let parsed = {};
    
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      console.error("❌ JSON Parse Error:", err.message);
      return simpleResumeExtraction(rawText);
    }
    
    return parsed;
  } catch (err) {
    console.error("❌ Error in extractResume:", err.message);
    return simpleResumeExtraction(rawText);
  }
}

/**
 * Normalize and clean skill names
 */
function normalizeSkillName(skill) {
  if (typeof skill !== 'string') return '';
  
  let normalized = skill.trim()
    .replace(/^(?:Frontend|Backend|Fullstack|Web|Mobile|Software|Mechanical|Civil|Electrical|Medical|Surgical|HR|Talent|Driving|Teaching|Nursing|Accounting|Financial)\s*(?:Development|Procedures|Practices|Licenses|Methods|Management|Engineering|Care|Reporting|Project|Legal|Patient|Clinical)\s*[:\\-]\s*/i, '')
    .replace(/^(?:Platforms?|Tools?|Technologies?|Skills?|Frameworks?|Languages?|Procedures?|Certifications?|Licenses?|Methods?|Standards?)\s*[:\\-]\s*/i, '')
    .replace(/^(?:Proficient in|Expert in|Experience with|Knowledge of|Specialized in|Trained in|Certified in|Licensed in|Skilled in)\s*/i, '')
    .replace(/^(?:creating|building|developing|managing|implementing|using|working with|performing|operating|designing|recruiting|teaching|diagnosing|analyzing|treating|driving|auditing)\s+/i, '')
    .replace(/React\.js/i, 'React')
    .replace(/Node\.js/i, 'Node')
    .replace(/Express\.js/i, 'Express')
    .replace(/JavaScript/i, 'JavaScript')
    .replace(/TypeScript/i, 'TypeScript')
    .replace(/HTML5?/i, 'HTML')
    .replace(/CSS3?/i, 'CSS')
    .replace(/AutoCAD/i, 'AutoCAD')
    .replace(/MATLAB/i, 'MATLAB')
    .replace(/SolidWorks/i, 'SolidWorks')
    .replace(/CPR certification/i, 'CPR')
    .replace(/Commercial Driver\'s License|CDL Class A|CDL Class B/i, 'CDL')
    .replace(/Performance Management/i, 'Performance Management')
    .replace(/Curriculum Development/i, 'Curriculum Development')
    .replace(/Laparoscopic Surgery/i, 'Laparoscopic Surgery')
    .replace(/Wound Care/i, 'Wound Care')
    .replace(/GAAP/i, 'GAAP')
    .replace(/HIPAA Compliance/i, 'HIPAA')
    .replace(/Project Management Professional|PMP/i, 'PMP')
    .replace(/\s*(?:development|framework|library|tool|technology|platform|software|procedure|practice|license|method|certification|system|operation|compliance|standard)\s*$/i, '')
    .replace(/\s*operations?\s*$/i, '')
    .replace(/\s*apis?\s*$/i, ' API')
    .replace(/\s+/g, ' ')
    .replace(/\s*[:\\-]\s*.*$/, '')
    .trim();

  if (normalized.length > 0) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return normalized;
}

/**
 * Enhanced skill validation and normalization
 */
function validateAndNormalizeSkills(skills, text) {
  if (!skills || !Array.isArray(skills)) return [];
  
  const normalizedSkills = skills.map(skill => normalizeSkillName(skill));
  
  const excludePatterns = [
    /^\d{4}/,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
    /present|current|ongoing|location|address|city|state|country/i,
    /years?|yrs?|months?|mos?|days?/i,
    /^[^a-z]+$/i,
    /\b(and|the|with|using|via|through|for|in|on|at)\b/i,
    /company|corporation|llc|inc|ltd|enterprise|firm|organization|hospital|clinic|school|university/i,
    /project|construction|site|plant|facility|manufacturing|production|department|office/i
  ];

  return normalizedSkills.filter(skill => {
    if (!skill || skill.length < 2 || skill.length > 50) return false;
    
    const lowerSkill = skill.toLowerCase();
    
    if (excludePatterns.some(pattern => pattern.test(lowerSkill))) {
      return false;
    }

    if (!/[a-z]/i.test(skill)) return false;

    return true;
  });
}

/**
 * Detect profession from text
 */
function detectProfession(text) {
  const textLower = text.toLowerCase();
  const professionPatterns = [
    { profession: "Software Developer", keywords: /\b(software|developer|programmer|coder|engineer\s*(?:software|web|application|frontend|backend|fullstack))\b/i },
    { profession: "Physician", keywords: /\b(physician|doctor|md|surgeon|cardiologist|pediatrician|medical\s*practitioner)\b/i },
    { profession: "Nurse", keywords: /\b(nurse|rn|registered\s*nurse|nurse\s*practitioner|cna)\b/i },
    { profession: "Mechanical Engineer", keywords: /\b(mechanical\s*engineer|mechanical\s*engineering)\b/i },
    { profession: "Civil Engineer", keywords: /\b(civil\s*engineer|civil\s*engineering|structural\s*engineer)\b/i },
    { profession: "Electrical Engineer", keywords: /\b(electrical\s*engineer|electrical\s*engineering)\b/i },
    { profession: "Truck Driver", keywords: /\b(truck\s*driver|commercial\s*driver|cdl\s*driver|delivery\s*driver)\b/i },
    { profession: "HR Manager", keywords: /\b(hr|human\s*resources|talent\s*management|recruitment\s*manager|hr\s*manager)\b/i },
    { profession: "Teacher", keywords: /\b(teacher|educator|professor|instructor|lecturer)\b/i },
    { profession: "Accountant", keywords: /\b(accountant|cpa|financial\s*analyst|bookkeeper|accounting)\b/i }
  ];

  for (const { profession, keywords } of professionPatterns) {
    if (keywords.test(textLower)) {
      return profession;
    }
  }
  return "unknown";
}

/**
 * Extract skills from text using pattern matching (fallback)
 */
function extractSkillsFromText(text, profession) {
  const skills = new Set();
  const textLower = text.toLowerCase();

  const professionSkillPatterns = {
    "Software Developer": [
      /\b(react|angular|vue|node|express|javascript|typescript|html|css|mongodb|sql|mysql|postgresql|aws|azure|docker|kubernetes|git|github|gitlab|postman|jira|jenkins)\b/gi,
      /\b(agile|scrum|kanban|devops|ci\/cd|rest|graphql|crud|mvc|oop|tdd|bdd|jest|mocha|cypress)\b/gi
    ],
    "Physician": [
      /\b(laparoscopic\s*surgery|cardiology|pediatrics|emergency\s*medicine|cpr|patient\s*diagnosis|surgical\s*procedures|emr|hipaa)\b/gi,
      /\b(ekg\s*interpretation|ultrasound|radiology|anesthesia\s*administration)\b/gi
    ],
    "Nurse": [
      /\b(wound\s*care|patient\s*care|iv\s*therapy|cpr|medication\s*administration|vital\s*signs\s*monitoring|emr|hipaa)\b/gi,
      /\b(patient\s*assessment|catheterization|phlebotomy)\b/gi
    ],
    "Mechanical Engineer": [
      /\b(autocad|solidworks|matlab|cad|finite\s*element\s*analysis|thermodynamics|mechanical\s*design|ansys)\b/gi,
      /\b(prototyping|material\s*selection|mechanical\s*testing)\b/gi
    ],
    "Civil Engineer": [
      /\b(autocad|civil3d|structural\s*analysis|geotechnical\s*engineering|bridge\s*design|surveying)\b/gi,
      /\b(construction\s*management|staad\.pro|sap2000)\b/gi
    ],
    "Electrical Engineer": [
      /\b(plc\s*programming|circuit\s*design|matlab|autocad\s*electrical|power\s*systems|embedded\s*systems)\b/gi,
      /\b(electrical\s*testing|control\s*systems|cad)\b/gi
    ],
    "Truck Driver": [
      /\b(cdl|hazmat|endorsement|defensive\s*driving|vehicle\s*inspection|logistics|route\s*planning)\b/gi,
      /\b(forklift\s*operation|pallet\s*truck|load\s*securement)\b/gi
    ],
    "HR Manager": [
      /\b(recruitment|talent\s*acquisition|performance\s*management|employee\s*relations|hris|payroll|compliance|onboarding)\b/gi,
      /\b(labor\s*laws|benefits\s*administration|conflict\s*resolution)\b/gi
    ],
    "Teacher": [
      /\b(curriculum\s*development|classroom\s*management|lesson\s*planning|educational\s*technology|student\s*assessment)\b/gi,
      /\b(special\s*education|esl\s*teaching|pedagogy)\b/gi
    ],
    "Accountant": [
      /\b(gaap|ifrs|financial\s*reporting|tax\s*preparation|auditing|quickbooks|excel|bookkeeping)\b/gi,
      /\b(budgeting|cost\s*accounting|financial\s*analysis)\b/gi
    ],
    "unknown": [
      /\b(project\s*management|communication|problem\s*solving|teamwork|leadership|time\s*management)\b/gi
    ]
  };

  const generalPatterns = [
    /(?:worked\s*with|utilized|used|implemented|developed|created|built|managed|performed|operated|designed|recruited|taught|diagnosed|analyzed|treated|drove|audited)\s+([^.,;]+)/gi,
    /(?:skills?|technologies?|tools?|proficient\s*in|expertise\s*in|specialized\s*in|experienced\s*in|knowledge\s*of|familiar\s*with|certified\s*in|licensed\s*in|trained\s*in)[:\s]*([^.•\n]+)/gi
  ];

  const patterns = [...(professionSkillPatterns[profession] || professionSkillPatterns["unknown"]), ...generalPatterns];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] || match[0]) {
        const skillText = match[1] || match[0];
        skillText.split(/[,&\/]/).forEach(part => {
          const skill = normalizeSkillName(part.trim());
          if (skill && skill.length > 2) {
            skills.add(skill);
          }
        });
      }
    }
  });

  return Array.from(skills);
}

/**
 * Main parsing function with enhanced skill processing
 */
async function parseResume(rawText) {
  try {
    console.log("📄 Starting resume parsing...");
    
    // Detect profession first
    const detectedProfession = detectProfession(rawText);
    console.log(`🔍 Detected Profession: ${detectedProfession}`);
    
    let parsedData = await extractResume(rawText);
    parsedData.profession = detectedProfession;
    
    // Normalize and validate skills
    if (parsedData.jobPreferences?.skills) {
      parsedData.jobPreferences.skills = validateAndNormalizeSkills(
        parsedData.jobPreferences.skills,
        rawText
      );
    }

    // Fallback to text extraction if needed
    if (!parsedData.jobPreferences?.skills || parsedData.jobPreferences.skills.length < 3) {
      console.log("🔄 Using enhanced text-based skill extraction");
      const textSkills = extractSkillsFromText(rawText, detectedProfession);
      const normalizedTextSkills = validateAndNormalizeSkills(textSkills, rawText);
      
      if (!parsedData.jobPreferences) {
        parsedData.jobPreferences = { skills: normalizedTextSkills };
      } else {
        const mergedSkills = [...new Set([
          ...(parsedData.jobPreferences.skills || []),
          ...normalizedTextSkills
        ])];
        parsedData.jobPreferences.skills = mergedSkills;
      }
    }

    // Final processing
    if (parsedData.jobPreferences.skills) {
      parsedData.jobPreferences.skills = [
        ...new Set(
          parsedData.jobPreferences.skills
            .filter(skill => skill && skill.length > 1 && skill.length < 50)
            .map(skill => skill.trim())
        )
      ].sort();
    }

    console.log(`✅ Resume parsed with ${parsedData.jobPreferences.skills.length} clean skills for ${detectedProfession}`);
    return parsedData;
  } catch (err) {
    console.error("❌ parseResume error:", err.message);
    const detectedProfession = detectProfession(rawText);
    const fallbackSkills = validateAndNormalizeSkills(extractSkillsFromText(rawText, detectedProfession), rawText);
    return { 
      profession: detectedProfession, 
      jobPreferences: { 
        skills: fallbackSkills,
        title: "",
        location: "",
        remote: false,
        preferredIndustries: []
      } 
    };
  }
}

// Export both functions as named exports
module.exports = { parseResume, hfCall };