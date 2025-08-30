const axios = require('axios');

class ResumeParser {
  constructor() {
    this.initialized = true;
    this.HF_BASE_URL = 'https://router.huggingface.co/v1';
    this.HF_TOKEN = process.env.HF_TOKEN;
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 1000;
  }

  async parseResume(rawText) {
    try {
      const cleanedText = this.cleanText(rawText);
      const lines = this.getLines(cleanedText);

      let aiResult = {};
      let parseMethod = 'rule-based';
      try {
        aiResult = await this.parseWithAI(cleanedText);
        parseMethod = 'AI';
      } catch (aiError) {
        console.warn('AI parsing failed, using rule-based fallback:', aiError.message);
      }

      const result = {
        name: aiResult.name || this.extractName(cleanedText, lines) || "",
        email: aiResult.email || this.extractEmail(cleanedText) || "",
        phone: aiResult.phone || this.extractPhone(cleanedText) || "",
        profession: aiResult.profession || this.detectProfession(cleanedText, lines) || "Professional",
        jobPreferences: {
          title: aiResult.jobPreferences?.title || this.extractJobTitle(cleanedText, lines) || "",
          location: aiResult.jobPreferences?.location || this.extractLocation(cleanedText) || "",
          skills: aiResult.jobPreferences?.skills || this.extractSkills(cleanedText) || [],
          remote: aiResult.jobPreferences?.remote !== undefined ? aiResult.jobPreferences.remote : this.detectRemotePreference(cleanedText),
          preferredIndustries: aiResult.jobPreferences?.preferredIndustries || this.extractIndustries(cleanedText) || [],
          salaryExpectations: "",
        },
        experience: aiResult.experience || this.extractExperience(cleanedText) || [],
        education: aiResult.education || this.extractEducation(cleanedText) || [],
        projects: aiResult.projects || this.extractProjects(cleanedText) || [],
        certifications: aiResult.certifications || this.extractCertifications(cleanedText) || [],
      };

      console.log(`Resume parsing completed using ${parseMethod} method`);
      return this.validateAndClean(result);
    } catch (error) {
      console.error('Resume parsing error:', error.message);
      return this.createMinimalResult();
    }
  }

  cleanApiResponse(content) {
    const jsonMatch = content.match(/{[\s\S]*}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    return content;
  }

  async parseWithAI(text) {
    if (!this.HF_TOKEN) {
      throw new Error("Hugging Face API token is not configured");
    }

    const systemPrompt = `
You are an expert resume parser capable of handling resumes from any profession (e.g., doctor, developer, engineer, HR, teacher, etc.). Extract information from the provided resume text and return it as a JSON object with the exact structure below. If a field cannot be extracted, return an empty string, empty array, or false. Do not include extra fields or explanations. Parse dates into MM/YYYY format for startDate and endDate; for year-only (e.g., 2024), assume January start and December end (01/2024, 12/2024). Set current to true only if the duration explicitly mentions "Present". Set location to empty string ("") unless explicitly stated as a city or state in a contact section. Use the resume header for profession and jobPreferences.title if available. Automatically detect and correct any typos or misspellings in the entire text using your language skills (e.g., "Deploma" to "Diploma", "Exprience" to "Experience", "gamil.com" to "gmail.com", "Phyisician" to "Physician", "Engeneer" to "Engineer", etc.). Identify the profession from the header or context without assuming specific roles. Return the result as a valid JSON string, without any additional text or comments.

{
  "name": string,
  "email": string,
  "phone": string,
  "profession": string,
  "jobPreferences": {
    "title": string,
    "location": string,
    "skills": [string],
    "remote": boolean,
    "preferredIndustries": [string],
    "salaryExpectations": string
  },
  "experience": [
    {
      "company": string,
      "position": string,
      "description": string,
      "startDate": string,
      "endDate": string,
      "current": boolean,
      "achievements": [string],
      "skills": [string]
    }
  ],
  "education": [
    {
      "institution": string,
      "degree": string,
      "fieldOfStudy": string,
      "startDate": string,
      "endDate": string,
      "current": boolean,
      "description": string
    }
  ],
  "projects": [
    {
      "title": string,
      "description": string,
      "technologies": [string],
      "startDate": string,
      "endDate": string,
      "current": boolean,
      "achievements": [string]
    }
  ],
  "certifications": [
    {
      "name": string,
      "issuer": string,
      "date": string,
      "expiryDate": string
    }
  ]
}

Resume text:
{resume_text}
`;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await axios.post(
          `${this.HF_BASE_URL}/chat/completions`,
          {
            model: 'meta-llama/Llama-3.1-8B-Instruct:cerebras',
            messages: [
              { role: 'system', content: systemPrompt.replace('{resume_text}', text) },
              { role: 'user', content: 'Parse the resume text into the specified JSON format. Return only the JSON object, with no additional text.' },
            ],
            max_tokens: 3000,
            temperature: 0.1,
          },
          {
            headers: {
              Authorization: `Bearer ${this.HF_TOKEN}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          }
        );

        let content = response.data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('No content returned from Hugging Face API');
        }

        content = this.cleanApiResponse(content);

        try {
          return JSON.parse(content);
        } catch (parseError) {
          console.error(`JSON parsing failed (attempt ${attempt}):`, {
            error: parseError.message,
            content: content.substring(0, 200)
          });
          if (attempt === this.MAX_RETRIES) {
            throw parseError;
          }
        }
      } catch (error) {
        console.error(`Hugging Face API error (attempt ${attempt}):`, {
          status: error.response?.status,
          message: error.message
        });
        if (attempt === this.MAX_RETRIES) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      }
    }

    throw new Error('Failed to parse resume with AI after maximum retries');
  }

  extractName(text, lines) {
    if (!text || !lines) return "";
    const strategies = [
      () => {
        if (lines.length > 0 && this.isLikelyName(lines[0])) {
          return lines[0];
        }
        return null;
      },
      () => {
        const patterns = [
          /(?:Name|Full Name|Contact)[:\s-]+([^\n]{3,50})/i,
          /(?:^|\n)((?:Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s+[A-Z][a-z]+)*\s*(?:\n|$)/
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1] && this.isLikelyName(match[1].trim())) {
            return match[1].trim();
          }
        }
        return null;
      },
      () => {
        const email = this.extractEmail(text);
        if (email) {
          const username = email.split('@')[0];
          const nameFromEmail = username
            .replace(/[._-]/g, ' ')
            .split(' ')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');
          if (this.isLikelyName(nameFromEmail)) {
            return nameFromEmail;
          }
        }
        return null;
      },
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result) return result;
    }

    return "";
  }

  isLikelyName(text) {
    if (!text || text.length < 3 || text.length > 50) return false;
    const lowerText = text.toLowerCase();
    const falsePositives = [
      'resume', 'cv', 'curriculum vitae', 'linkedin', 'github',
      'portfolio', 'objective', 'summary', 'experience', 'education',
      'skills', 'contact', 'email', 'phone', 'address', 'full stack'
    ];
    if (falsePositives.some(fp => lowerText.includes(fp))) {
      return false;
    }
    const words = text.split(/\s+/);
    if (words.length < 1 || words.length > 4) return false;
    return words.every(word => /^[A-Z]/.test(word) || /^[A-Z]+$/.test(word) || /^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)$/.test(word));
  }

  extractEmail(text) {
    if (!text) return "";
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
    const match = text.match(emailPattern);
    if (match) {
      let email = match[0];
      email = email.replace(/\.com\.com$/, '.com')
                   .replace(/\.con$/, '.com')
                   .replace(/@gamil\.com$/, '@gmail.com')
                   .replace(/@gmial\.com$/, '@gmail.com')
                   .replace(/@yaho\.com$/, '@yahoo.com')
                   .replace(/@yahho\.com$/, '@yahoo.com')
                   .replace(/@hotmil\.com$/, '@hotmail.com')
                   .replace(/@outlok\.com$/, '@outlook.com');
      return email;
    }
    return "";
  }

  extractPhone(text) {
    if (!text) return "";
    const phonePatterns = [
      /\b\+?\d{1,3}[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
      /\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/,
      /\b\d{10,12}\b/
    ];
    for (const pattern of phonePatterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    return "";
  }

  detectProfession(text, lines) {
    if (!text || !lines) return "Professional";
    const headerPatterns = [
      /(?:^|\n)((?:Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)?\s*[A-Z][a-zA-Z\s]*(?:Developer|Engineer|Physician|Doctor|Manager|Analyst|Scientist|Consultant|Specialist|Coordinator|Administrator|Teacher|Professor))/i
    ];
    for (const pattern of headerPatterns) {
      for (const line of lines.slice(0, 5)) {
        const match = line.match(pattern);
        if (match && match[0].length > 5 && !this.isLikelyName(line)) {
          return match[0].trim();
        }
      }
    }
    const patterns = [
      /(?:Experience|Summary|Objective)[:\s]*(.*?)(?:\n|$)/is
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const words = match[1].split(/\s+/);
        for (const word of words) {
          if (/^(Developer|Engineer|Physician|Doctor|Manager|Analyst|Scientist|Consultant|Specialist|Coordinator|Administrator|Teacher|Professor)$/i.test(word)) {
            return word;
          }
        }
      }
    }
    return "Professional";
  }

  extractJobTitle(text, lines) {
    if (!text || !lines) return "";
    const headerPatterns = [
      /(?:^|\n)((?:Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)?\s*[A-Z][a-zA-Z\s]*(?:Developer|Engineer|Physician|Doctor|Manager|Analyst|Scientist|Consultant|Specialist|Coordinator|Administrator|Teacher|Professor))/i
    ];
    for (const pattern of headerPatterns) {
      for (const line of lines.slice(0, 5)) {
        const match = line.match(pattern);
        if (match && match[0].length > 5 && !this.isLikelyName(line)) {
          return match[0].trim();
        }
      }
    }
    const patterns = [
      /(?:Current|Present).*?(?:Position|Role|Title)[:\s]*([^\n]{5,80})/i,
      /(?:^|\n)((?:Senior|Junior|Lead|Principal)?\s*[A-Za-z\s]*(?:Developer|Engineer|Physician|Doctor|Manager|Analyst|Scientist|Consultant|Specialist|Coordinator|Administrator|Teacher|Professor))/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return "";
  }

  extractLocation(text) {
    if (!text) return "";
    const patterns = [
      /(?:Location|Address|Based\s*in|Located\s*in)[:\s]*([^\n,]{3,50})/i,
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]*)*)[,\s]*(?:CA|NY|TX|FL|IL|PA|OH|GA|NC|MI|NJ|VA|WA|AZ|MA|IN|TN|MO|MD|WI|MN|CO|AL|SC|LA|KY|OR|OK|CT|IA|MS|AR|UT|NV|NM|WV|NE|ID|HI|ME|NH|RI|MT|DE|SD|AK|ND|VT|WY|India)\b/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const location = match[1].trim();
        if (location.length > 2 && location.length < 50 && !/based filtering/i.test(location) && !this.isLikelyName(location)) {
          return location;
        }
      }
    }
    return "";
  }

  extractSkills(text) {
    if (!text) return [];
    const skills = new Set();
    const skillSections = [
      'Skills', 'Technical Skills', 'Technologies', 'Expertise',
      'Programming Languages', 'Frameworks', 'Tools', 'Databases',
      'Competencies', 'Proficiencies', 'Abilities'
    ].map(section => this.correctSectionTypo(section));
    skillSections.forEach(section => {
      const sectionContent = this.extractSection(text, section);
      if (sectionContent) {
        this.extractSkillsFromSection(sectionContent).forEach(skill => skills.add(skill));
      }
    });
    const experience = this.extractSection(text, 'Experience|Work Experience|Employment');
    if (experience) {
      this.extractSkillsFromText(experience).forEach(skill => skills.add(skill));
    }
    const projects = this.extractSection(text, 'Projects|Personal Projects');
    if (projects) {
      this.extractSkillsFromText(projects).forEach(skill => skills.add(skill));
    }
    return Array.from(skills).filter(skill => this.isValidSkill(skill));
  }

  extractSkillsFromSection(sectionText) {
    const skills = [];
    const patterns = [
      /[•\-]\s*([^\n]{3,50})/g,
      /,\s*([^\n,]{3,50})/g,
      /\n\s*([^\n]{3,50})/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(sectionText)) !== null) {
        if (match[1]) {
          const skill = match[1].trim();
          if (this.isValidSkill(skill)) {
            skills.push(skill);
          }
        }
      }
    });

    return skills;
  }

  extractSkillsFromText(text) {
    if (!text) return [];
    const keywords = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'PHP', 'Ruby',
      'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring',
      'FastAPI', 'Next.js', 'Electron.js', 'MUI', 'Redux', 'Tailwind CSS', 'Bootstrap',
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'SQLite', 'DynamoDB',
      'AWS', 'Azure', 'Firebase', 'Cloudinary', 'Docker', 'Kubernetes', 'Git', 'GitHub',
      'GitLab', 'Jenkins', 'Jira', 'Webdriver.io', 'Mocha Chai', 'GitHub Actions', 'Nginx',
      'Web Audio API', 'JWT Authentication', 'OAuth 2.0', 'Mongoose ODM', 'VS Code',
      'Postman', 'npm', 'Linux', 'Chrome DevTools', 'Ejs', 'CloudWatch', 'QuickBlox',
      'Patient Care', 'Surgery', 'Diagnosis', 'Recruitment', 'Employee Relations', 'Payroll',
      'Teaching', 'Curriculum Development', 'Project Management', 'Financial Analysis',
      'Data Analysis', 'Machine Learning', 'AI', 'Blockchain', 'Cybersecurity', 'DevOps',
      'Clinical Research', 'Nursing', 'Therapy', 'Counseling', 'Sales', 'Marketing',
      'SEO', 'Content Creation', 'Graphic Design', 'UI/UX Design', 'Leadership',
      'Team Management', 'Strategic Planning', 'Budgeting', 'Legal Advice', 'Contract Negotiation'
    ];
    return keywords.filter(keyword => 
      new RegExp(`\\b${keyword}\\b`, 'i').test(text)
    );
  }

  isValidSkill(skill) {
    if (!skill || typeof skill !== 'string') return false;
    const cleanSkill = skill.trim();
    if (cleanSkill.length < 2 || cleanSkill.length > 50) return false;
    const exclude = [
      /^\d+$/, /^(and|or|with|using|the|a|an|in|on|at|for|of|to|from)$/i,
      /^(years?|months?|experience|work|job|position|role)$/i,
      /(university|college|school|institute)$/i,
      /(company|corporation|llc|inc)$/i
    ];
    return !exclude.some(pattern => pattern.test(cleanSkill)) && /[a-zA-Z]/.test(cleanSkill);
  }

  extractExperience(text) {
    if (!text) return [];
    const experiences = [];
    const expSection = this.extractSection(text, 'Experience|Work Experience|Employment|Professional Experience');
    if (expSection) {
      const entries = expSection.split(/\n(?=\s*(?:[A-Z]|\d))/).filter(entry => entry.trim());
      entries.forEach(entry => {
        const experience = this.parseExperienceEntry(entry);
        if (experience) {
          experiences.push(experience);
        }
      });
    }
    return experiences;
  }

  parseExperienceEntry(entry) {
    if (!entry) return null;
    const lines = entry.split('\n').filter(line => line.trim());
    if (lines.length === 0) return null;
    const firstLine = lines[0];
    const companyPositionMatch = firstLine.match(/(.+?)\s*[\|-]\s*(.+?)(?:\s*[\|-]\s*(.+))?$/);
    if (!companyPositionMatch) return null;
    const duration = companyPositionMatch[3] || "";
    const { startDate, endDate } = this.parseDate(duration);
    return {
      company: companyPositionMatch[1]?.trim() || "",
      position: companyPositionMatch[2]?.trim() || "",
      description: lines.length > 1 ? lines.slice(1).join(' ') : "",
      startDate,
      endDate,
      current: this.isCurrent(duration),
      achievements: lines.length > 1 ? this.extractAchievements(lines.slice(1).join(' ')) : [],
      skills: this.extractSkillsFromText(lines.slice(1).join(' ')),
    };
  }

  extractEducation(text) {
    if (!text) return [];
    const education = [];
    const eduSection = this.extractSection(text, 'Education|Eduacation|Deploma|Diploma');
    if (eduSection) {
      const entries = eduSection.split(/\n(?=\s*(?:[A-Z]|\d))/);
      entries.forEach(entry => {
        const lines = entry.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          const firstLine = lines[0];
          const parts = firstLine.split(/[-|]/).map(part => part?.trim() || "");
          const durationLine = lines.find(line => line.match(/\d{4}/) || line.match(/Present|present/i)) || "";
          const { startDate, endDate } = this.parseDate(durationLine);
          education.push({
            institution: parts[0] || "",
            degree: parts.length > 1 ? parts[1] : "",
            fieldOfStudy: parts.length > 2 ? parts[2] : "",
            startDate,
            endDate,
            current: this.isCurrent(durationLine),
            description: lines.length > 2 ? lines.slice(2).join(' ') : "",
          });
        }
      });
    }
    return education;
  }

  extractProjects(text) {
    if (!text) return [];
    const projects = [];
    const projectSection = this.extractSection(text, 'Projects|Personal Projects|Key Projects');
    if (projectSection) {
      const entries = projectSection.split(/\n(?=\s*(?:[A-Z]|\d))/);
      entries.forEach(entry => {
        const lines = entry.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          const durationLine = lines.find(line => line.match(/\d{4}/) || line.match(/Present|present/i)) || "";
          const { startDate, endDate } = this.parseDate(durationLine);
          projects.push({
            title: lines[0]?.trim() || "",
            description: lines.length > 1 ? lines.slice(1).join(' ') : "",
            technologies: this.extractSkillsFromText(lines.join(' ')),
            startDate,
            endDate,
            current: this.isCurrent(durationLine),
            achievements: lines.length > 1 ? this.extractAchievements(lines.slice(1).join(' ')) : [],
          });
        }
      });
    }
    return projects;
  }

  extractCertifications(text) {
    if (!text) return [];
    const certifications = [];
    const certSection = this.extractSection(text, 'Certifications|Certificates|Key Achievements|Accomplishments');
    if (certSection) {
      const entries = certSection.split('\n').filter(line => line.trim());
      entries.forEach(entry => {
        const parts = entry.split(/[-|]/).map(part => part?.trim() || "");
        const date = parts.find(part => part.match(/\d{4}/) || part.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{4}/i)) || "";
        certifications.push({
          name: parts[0] || "",
          issuer: parts.length > 1 ? parts[1] : "",
          date: this.normalizeDate(date),
          expiryDate: "",
        });
      });
    }
    return certifications;
  }

  extractIndustries(text) {
    if (!text) return ['General'];
    const industries = [];
    const industryPatterns = {
      'Technology': /tech|software|it|computer|programming|developer/i,
      'Healthcare': /healthcare|medical|hospital|pharmaceutical|health|physician|doctor|patient/i,
      'Education': /education|university|school|teaching|academic|professor|teacher/i,
      'Finance': /finance|banking|investment|accounting|financial/i,
      'Human Resources': /hr|human resources|recruitment|employee relations|payroll/i,
      'Engineering': /engineer|engineering|mechanical|electrical|civil|chemical/i,
      'Management': /manager|management|director|lead|head of|supervisor/i,
      'Marketing': /marketing|advertising|branding|SEO|content creation/i,
      'Sales': /sales|business development|customer service|retail/i,
      'Legal': /legal|law|attorney|compliance|contract/i,
      'Design': /design|graphic|UI|UX|creative/i,
      'Manufacturing': /manufacturing|production|supply chain|logistics/i,
      'Research': /research|science|data analysis|lab/i
    };
    for (const [industry, pattern] of Object.entries(industryPatterns)) {
      if (pattern.test(text)) {
        industries.push(industry);
      }
    }
    return industries.length > 0 ? industries : ['General'];
  }

  detectRemotePreference(text) {
    if (!text) return false;
    return /remote|work\s*from\s*home|distributed|location\s*independent/i.test(text);
  }

  cleanText(text) {
    if (!text) return "";
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getLines(text) {
    if (!text) return [];
    return text.split('\n')
      .map(line => line?.trim() || "")
      .filter(line => line.length > 0);
  }

  extractSection(text, sectionName) {
    if (!text) return "";
    const correctedSection = this.correctSectionTypo(sectionName);
    const pattern = new RegExp(`${correctedSection}[:\s]*(.*?)(?=\\n\\s*[A-Z][A-Za-z]|$)`, 'is');
    const match = text.match(pattern);
    return match ? match[1].trim() : '';
  }

  correctSectionTypo(sectionName) {
    const typoMap = {
      'eduacation': 'Education',
      'deploma': 'Education',
      'diploma': 'Education',
      'exprience': 'Experience',
      'experiance': 'Experience',
      'work exprience': 'Work Experience',
      'certifcates': 'Certifications',
      'certficates': 'Certifications',
      'achievments': 'Achievements',
      'acheivements': 'Achievements',
      'projcts': 'Projects',
      'parsonal projects': 'Personal Projects',
      'profesional experience': 'Professional Experience',
      'employmant': 'Employment',
      'skils': 'Skills',
      'techncal skills': 'Technical Skills'
    };
    return typoMap[sectionName.toLowerCase()] || sectionName;
  }

  parseDate(duration) {
    if (!duration) return { startDate: "", endDate: "" };
    const dateRegex = /(\w+\s*\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{4})\s*[-–—]\s*(\w+\s*\d{4}|Present|present)/i;
    const yearOnlyRegex = /(\d{4})\s*[-–—]\s*(\d{4}|Present|present)/i;
    const singleYearRegex = /^(\d{4})$/i;
    const shortRangeRegex = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*[-–—]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})/i;
    let match = duration.match(dateRegex);
    if (match) {
      return {
        startDate: this.normalizeDate(match[1].trim()),
        endDate: match[2].trim().toLowerCase() === 'present' ? 'Present' : this.normalizeDate(match[2].trim()),
      };
    }
    match = duration.match(yearOnlyRegex);
    if (match) {
      return {
        startDate: `01/${match[1].trim()}`,
        endDate: match[2].trim().toLowerCase() === 'present' ? 'Present' : `12/${match[2].trim()}`,
      };
    }
    match = duration.match(singleYearRegex);
    if (match) {
      return {
        startDate: `01/${match[1].trim()}`,
        endDate: `12/${match[1].trim()}`,
      };
    }
    match = duration.match(shortRangeRegex);
    if (match) {
      return {
        startDate: `01/${match[1].trim()}`,
        endDate: `12/${match[1].trim()}`,
      };
    }
    return { startDate: "", endDate: "" };
  }

  normalizeDate(dateStr) {
    if (!dateStr || dateStr.toLowerCase() === 'present') return "";
    const months = {
      'jan': '01', 'january': '01', 'feb': '02', 'february': '02',
      'mar': '03', 'march': '03', 'apr': '04', 'april': '04',
      'may': '05', 'jun': '06', 'june': '06', 'jul': '07', 'july': '07',
      'aug': '08', 'august': '08', 'sep': '09', 'sept': '09', 'september': '09',
      'oct': '10', 'october': '10', 'nov': '11', 'november': '11',
      'dec': '12', 'december': '12'
    };
    const parts = dateStr.split(/\s+/);
    if (parts.length === 2 && months[parts[0].toLowerCase()] && /^\d{4}$/.test(parts[1])) {
      return `${months[parts[0].toLowerCase()]}/${parts[1]}`;
    }
    if (/^\d{4}$/.test(dateStr)) {
      return `01/${dateStr}`;
    }
    return "";
  }

  isCurrent(duration) {
    if (!duration) return false;
    return /Present|present/i.test(duration);
  }

  extractAchievements(description) {
    if (!description) return [];
    return description
      .split(/[.;]/)
      .map(s => s?.trim() || "")
      .filter(s => s.length > 10 && /[a-zA-Z]/.test(s));
  }

  validateAndClean(result) {
    return {
      name: typeof result.name === 'string' && result.name.trim() && result.name.length < 100 ? result.name.trim() : "",
      email: typeof result.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email.trim()) ? result.email.trim() : "",
      phone: typeof result.phone === 'string' ? result.phone.trim() : "",
      profession: typeof result.profession === 'string' && result.profession.trim() ? result.profession.trim() : "Professional",
      jobPreferences: {
        title: typeof result.jobPreferences?.title === 'string' && result.jobPreferences.title.trim() && result.jobPreferences.title.length < 100 ? result.jobPreferences.title.trim() : "",
        location: typeof result.jobPreferences?.location === 'string' && result.jobPreferences.location.trim() && result.jobPreferences.location.length < 100 ? result.jobPreferences.location.trim() : "",
        skills: Array.isArray(result.jobPreferences?.skills)
          ? [...new Set(result.jobPreferences.skills.filter(skill => typeof skill === 'string' && skill.trim().length > 2 && skill.trim().length < 50))]
          : [],
        remote: typeof result.jobPreferences?.remote === 'boolean' ? result.jobPreferences.remote : false,
        preferredIndustries: Array.isArray(result.jobPreferences?.preferredIndustries)
          ? result.jobPreferences.preferredIndustries.filter(ind => typeof ind === 'string' && ind.trim())
          : [],
        salaryExpectations: "",
      },
      experience: Array.isArray(result.experience)
        ? result.experience.map(exp => ({
            company: typeof exp.company === 'string' ? exp.company.trim() : "",
            position: typeof exp.position === 'string' ? exp.position.trim() : "",
            description: typeof exp.description === 'string' ? exp.description.trim() : "",
            startDate: typeof exp.startDate === 'string' ? exp.startDate.trim() : "",
            endDate: typeof exp.endDate === 'string' ? exp.endDate.trim() : "",
            current: typeof exp.current === 'boolean' ? exp.current : false,
            achievements: Array.isArray(exp.achievements) ? exp.achievements.filter(a => typeof a === 'string' && a.trim()) : [],
            skills: Array.isArray(exp.skills) ? exp.skills.filter(s => typeof s === 'string' && s.trim()) : [],
          }))
        : [],
      education: Array.isArray(result.education)
        ? result.education.map(edu => ({
            institution: typeof edu.institution === 'string' ? edu.institution.trim() : "",
            degree: typeof edu.degree === 'string' ? edu.degree.trim() : "",
            fieldOfStudy: typeof edu.fieldOfStudy === 'string' ? edu.fieldOfStudy.trim() : "",
            startDate: typeof edu.startDate === 'string' ? edu.startDate.trim() : "",
            endDate: typeof edu.endDate === 'string' ? edu.endDate.trim() : "",
            current: typeof edu.current === 'boolean' ? edu.current : false,
            description: typeof edu.description === 'string' ? edu.description.trim() : "",
          }))
        : [],
      projects: Array.isArray(result.projects)
        ? result.projects.map(proj => ({
            title: typeof proj.title === 'string' ? proj.title.trim() : "",
            description: typeof proj.description === 'string' ? proj.description.trim() : "",
            technologies: Array.isArray(proj.technologies) ? proj.technologies.filter(t => typeof t === 'string' && t.trim()) : [],
            startDate: typeof proj.startDate === 'string' ? proj.startDate.trim() : "",
            endDate: typeof proj.endDate === 'string' ? proj.endDate.trim() : "",
            current: typeof proj.current === 'boolean' ? proj.current : false,
            achievements: Array.isArray(proj.achievements) ? proj.achievements.filter(a => typeof a === 'string' && a.trim()) : [],
          }))
        : [],
      certifications: Array.isArray(result.certifications)
        ? result.certifications.map(cert => ({
            name: typeof cert.name === 'string' ? cert.name.trim() : "",
            issuer: typeof cert.issuer === 'string' ? cert.issuer.trim() : "",
            date: typeof cert.date === 'string' ? cert.date.trim() : "",
            expiryDate: typeof cert.expiryDate === 'string' ? cert.expiryDate.trim() : "",
          }))
        : [],
    };
  }

  createMinimalResult() {
    return this.validateAndClean({});
  }
}

module.exports = { parseResume: (rawText) => new ResumeParser().parseResume(rawText) };