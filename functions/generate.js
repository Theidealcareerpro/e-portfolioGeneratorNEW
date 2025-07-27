const { Octokit } = require('@octokit/rest');
const { createClient } = require('@supabase/supabase-js');
const querystring = require('querystring');
const { v4: uuidv4 } = require('uuid');

// Initialize GitHub client with PAT (stored in Netlify env variables)
const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

// Initialize Supabase client (store URL and key in Netlify env variables)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Simple HTML template for portfolio
const generatePortfolioHTML = (data) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.name}'s Portfolio</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body class="bg-gray-100 font-sans">
  <header class="bg-blue-600 text-white p-4">
    <h1 class="text-3xl">${data.name}</h1>
    <p>${data.email} | ${data.phone} | <a href="${data.linkedin}" class="underline">LinkedIn</a></p>
  </header>
  <main class="max-w-4xl mx-auto p-4">
    <section>
      <h2 class="text-2xl mt-4">About Me</h2>
      <p>${data.about}</p>
    </section>
    <section>
      <h2 class="text-2xl mt-4">Skills</h2>
      <ul class="list-disc pl-5">${data.skills.split(',').map(skill => `<li>${skill.trim()}</li>`).join('')}</ul>
    </section>
    <section>
      <h2 class="text-2xl mt-4">Projects</h2>
      ${data.projects.map(project => `
        <div class="mt-2">
          <h3 class="text-xl">${project.title}</h3>
          <p>${project.description}</p>
        </div>
      `).join('')}
    </section>
  </main>
</body>
</html>
`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    // Parse form data (multipart for files, querystring for text)
    const data = JSON.parse(event.body); // Assumes JSON payload; adjust for multipart if needed
    const { type, user_email, formData } = data; // type: 'portfolio', 'cv', or 'coverletter'
    const userId = uuidv4();
    const repoName = `${type}-user-${userId}`;
    const repoUrl = `https://eportfoliogen.github.io/${repoName}`;

    // Create GitHub repository
    await octokit.repos.createInOrg({
      org: 'ePortfolioGen',
      name: repoName,
      auto_init: true,
      private: false,
    });

    // Handle content based on type
    let fileContent, filePath;
    if (type === 'portfolio') {
      fileContent = Buffer.from(generatePortfolioHTML(formData)).toString('base64');
      filePath = 'index.html';
    } else {
      // For CV/cover letter, assume PDF is sent as base64
      fileContent = formData.pdf; // Base64-encoded PDF
      filePath = `${type}.pdf`;
    }

    // Commit file to gh-pages branch
    await octokit.repos.createOrUpdateFileContents({
      org: 'ePortfolioGen',
      repo: repoName,
      path: filePath,
      message: `Add ${type} for user ${userId}`,
      content: fileContent,
      branch: 'gh-pages',
    });

    // Enable GitHub Pages
    await octokit.repos.update({
      org: 'ePortfolioGen',
      repo: repoName,
      pages: {
        source: { branch: 'gh-pages', path: '/' },
      },
    });

    // Store metadata in Supabase
    const { error } = await supabase.from('portfolios').insert({
      id: userId,
      user_email,
      [`${type}_repo`]: repoName,
      [`${type}_url`]: repoUrl,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    });
    if (error) throw new Error(`Supabase insert failed: ${error.message}`);

    // Log analytics event
    await supabase.from('analytics').insert({
      event_type: `${type}_created`,
      resource_type: type,
      resource_id: userId,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: repoUrl, repo: repoName }),
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Failed to generate ${data.type}: ${error.message}` }),
    };
  }
};
