const { createClient } = require('@supabase/supabase-js');
const { Octokit } = require('@octokit/rest');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');

module.exports = async (req, res) => {
  try {
    console.log('Starting portfolio generation...');
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    // Parse form data (Vercel parses form-data or JSON)
    const data = {};
    let imageBase64 = null;
    let cvBase64 = null;

    for (const key in req.body) {
      if (key === 'image' && req.body[key].startsWith('data:image')) {
        imageBase64 = req.body[key];
      } else if (key === 'cv' && req.body[key].startsWith('data:application/pdf')) {
        cvBase64 = req.body[key];
      } else if (key === 'skills' || key === 'projects') {
        data[key] = JSON.parse(req.body[key]);
      } else {
        data[key] = req.body[key];
      }
    }

    const userId = uuidv4();
    const portfolioUrl = `https://eportfoliogen.github.io/portfolio-${userId}`;
    const deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    // Save to Supabase
    const { data: portfolioData, error: portfolioError } = await supabase
      .from('portfolios')
      .insert([{
        user_id: userId,
        name: data.name,
        profession: data.profession,
        tagline: data.tagline,
        summary: data.summary,
        about: data.about,
        email: data.user_email,
        phone: data.phone,
        linkedin: data.linkedin,
        skills: data.skills,
        projects: data.projects,
        template: data.template || 'default',
        portfolio_url: portfolioUrl,
        deletion_date: deletionDate
      }]);

    if (portfolioError) {
      console.error('Supabase portfolio error:', portfolioError);
      return res.status(500).json({ error: 'Failed to save portfolio data' });
    }

    // Save analytics
    const { error: analyticsError } = await supabase
      .from('analytics')
      .insert([{ user_id: userId, page_type: 'portfolio', created_at: new Date().toISOString() }]);

    if (analyticsError) {
      console.error('Supabase analytics error:', analyticsError);
      return res.status(500).json({ error: 'Failed to save analytics data' });
    }

    // Schedule deletion
    const { error: scheduleError } = await supabase
      .from('scheduled_deletions')
      .insert([{ user_id: userId, portfolio_path: `portfolio-${userId}.html`, deletion_date: deletionDate }]);

    if (scheduleError) {
      console.error('Supabase schedule deletion error:', scheduleError);
      return res.status(500).json({ error: 'Failed to schedule portfolio deletion' });
    }

    // Generate portfolio HTML
    const templateStyles = {
      default: 'background-color: #ffffff; color: #1f2937;',
      dark: 'background-color: #1f2937; color: #f9fafb;',
      vibrant: 'background-color: #fef3c7; color: #7c2d12;'
    };
    const templateStyle = templateStyles[data.template || 'default'];

    const skillsList = (data.skills || []).filter(skill => skill.name).map((skill, index) => `
      <div key="skill-${index}">
        <span>${skill.name}</span>
        <div class="w-full bg-gray-200 rounded-full h-2.5">
          <div class="bg-indigo-600 h-2.5 rounded-full" style="width: ${skill.proficiency}%"></div>
        </div>
      </div>
    `).join('') || '<p>No skills provided</p>';

    const projectsList = (data.projects || []).filter(project => project.title).map((project, index) => `
      <div key="project-${index}">
        <h4 class="font-semibold">${project.title}</h4>
        <p>${project.description || 'Project description'}</p>
        ${project.link ? `<a href="${project.link}" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">${project.link}</a>` : ''}
        <p class="text-sm">${project.category || 'Category'}</p>
      </div>
    `).join('') || '<p>No projects provided</p>';

    const portfolioHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="description" content="Portfolio of ${data.name || 'User'}">
        <title>${data.name || 'User'}'s Portfolio</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@500;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; }
          .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
          .progress-bar { transition: width 0.3s ease-in-out; }
        </style>
      </head>
      <body style="${templateStyle}">
        <div class="container">
          ${imageBase64 ? `<img src="${imageBase64}" alt="Profile" class="w-32 h-32 rounded-full mx-auto mb-4 object-cover shadow-md">` : 
            `<div class="w-32 h-32 rounded-full mx-auto mb-4 bg-gray-200 flex items-center justify-center text-gray-500">No Image</div>`}
          <h2 class="text-2xl font-poppins font-semibold mb-2 text-center">${data.name || 'Your Name'}</h2>
          <p class="mb-4 text-center">${data.profession || 'Profession'} | ${data.tagline || 'Tagline'}</p>
          <h3 class="text-xl font-semibold mb-2">About</h3>
          <p class="mb-4">${data.about || 'Your about section'}</p>
          <h3 class="text-xl font-semibold mb-2">Summary</h3>
          <p class="mb-4">${data.summary || 'Your summary'}</p>
          <h3 class="text-xl font-semibold mb-2">Skills</h3>
          <div class="space-y-2 mb-4">${skillsList}</div>
          <h3 class="text-xl font-semibold mb-2">Projects</h3>
          <div class="space-y-4 mb-4">${projectsList}</div>
          <h3 class="text-xl font-semibold mb-2">Contact</h3>
          <p>${data.email || 'email@example.com'}</p>
          <p>${data.phone || 'Phone'}</p>
          <p><a href="${data.linkedin || '#'}" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">${data.linkedin || 'LinkedIn'}</a></p>
          ${cvBase64 ? `<p class="mt-2"><a href="${cvBase64}" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">View CV</a></p>` : ''}
        </div>
      </body>
      </html>
    `;

    // Push to GitHub
    const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
    const repoOwner = 'eportfoliogen';
    const repoName = 'eportfoliogen.github.io';
    const path = `portfolio-${userId}.html`;

    await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path,
      message: `Add portfolio for ${data.name || 'user'}`,
      content: Buffer.from(portfolioHtml).toString('base64'),
      committer: { name: 'Portfolio Bot', email: 'bot@eportfoliogen.com' },
      author: { name: 'Portfolio Bot', email: 'bot@eportfoliogen.com' }
    });

    console.log('Portfolio generated successfully:', portfolioUrl);
    return res.status(200).json({ url: portfolioUrl });
  } catch (error) {
    console.error('Error generating portfolio:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
