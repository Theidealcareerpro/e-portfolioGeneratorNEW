const { createClient } = require('@supabase/supabase-js');
const { Octokit } = require('@octokit/rest');
const Busboy = require('busboy');

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const octokit = new Octokit({ auth: process.env.GH_TOKEN });

  try {
    // Parse FormData
    const formData = await new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: event.headers });
      const data = {};
      busboy.on('field', (name, value) => {
        data[name] = value;
      });
      busboy.on('finish', () => resolve(data));
      busboy.on('error', reject);
      busboy.write(Buffer.from(event.body, 'base64'));
    });

    // Parse JSON fields
    if (formData.skills) formData.skills = JSON.parse(formData.skills);
    if (formData.projects) formData.projects = JSON.parse(formData.projects);

    // Validate required fields
    if (!formData.name || !formData.profession || !formData.email) {
      throw new Error('Missing required fields');
    }

    // Generate repo name and URL
    const repoName = `${formData.name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    const portfolioUrl = `https://eportfoliogen.github.io/${repoName}`;

    // Insert into Supabase
    const { error } = await supabase.from('portfolios').insert({
      name: formData.name,
      profession: formData.profession,
      tagline: formData.tagline,
      summary: formData.summary,
      about: formData.about,
      email: formData.email,
      phone: formData.phone,
      linkedin: formData.linkedin,
      skills: formData.skills,
      projects: formData.projects,
      template: formData.template,
      portfolio_url: portfolioUrl,
      image: formData.image, // Base64 string
      cv: formData.cv // Base64 string
    });

    if (error) throw new Error(error.message);

    // Create GitHub repository
    await octokit.repos.createInOrg({
      org: process.env.GH_ORG,
      name: repoName,
      auto_init: true,
      homepage: portfolioUrl
    });

    // Create index.html with portfolio data
    const content = Buffer.from(
      `<!DOCTYPE html><html><body>
        <h1>${formData.name}'s Portfolio</h1>
        <p>${formData.profession} | ${formData.tagline}</p>
        ${formData.image ? `<img src="${formData.image}" alt="Profile" width="100">` : ''}
        <h2>About</h2><p>${formData.about}</p>
        <h2>Summary</h2><p>${formData.summary}</p>
        <h2>Skills</h2><ul>${(formData.skills || []).map(s => `<li>${s.name} (${s.proficiency}%)</li>`).join('')}</ul>
        <h2>Projects</h2>${(formData.projects || []).map(p => `<div><h3>${p.title}</h3><p>${p.description}</p>${p.link ? `<a href="${p.link}">Link</a>` : ''}</div>`).join('')}
        <h2>Contact</h2>
        <p>Email: ${formData.email}</p>
        <p>Phone: ${formData.phone}</p>
        ${formData.linkedin ? `<p><a href="${formData.linkedin}">LinkedIn</a></p>` : ''}
        ${formData.cv ? `<p><a href="${formData.cv}" download>Download CV</a></p>` : ''}
      </body></html>`
    ).toString('base64');

    await octokit.repos.createOrUpdateFileContents({
      owner: process.env.GH_ORG,
      repo: repoName,
      path: 'index.html',
      message: 'Initial portfolio page',
      content
    });

    await octokit.repos.requestPagesBuild({
      owner: process.env.GH_ORG,
      repo: repoName
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://theidealcareerprogenerator.netlify.app',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ url: portfolioUrl })
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://theidealcareerprogenerator.netlify.app',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
