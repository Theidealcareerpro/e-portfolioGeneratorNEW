const { createClient } = require('@supabase/supabase-js');
const { Octokit } = require('@octokit/rest');

exports.handler = async (event) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY // Use service_role key in Vercel env
  );
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  try {
    const formData = JSON.parse(event.body);
    const repoName = `${formData.name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    const portfolioUrl = `https://eportfoliogen.github.io/${repoName}`;

    // Insert portfolio into Supabase
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
      portfolio_url: portfolioUrl
    });

    if (error) throw new Error(error.message);

    // Create GitHub repository
    await octokit.repos.createInOrg({
      org: process.env.GITHUB_ORG,
      name: repoName,
      auto_init: true,
      homepage: portfolioUrl
    });

    // Create portfolio HTML file (simplified)
    const content = Buffer.from(
      `<!DOCTYPE html><html><body><h1>${formData.name}'s Portfolio</h1>...</body></html>`
    ).toString('base64');
    await octokit.repos.createOrUpdateFileContents({
      owner: process.env.GITHUB_ORG,
      repo: repoName,
      path: 'index.html',
      message: 'Initial portfolio page',
      content
    });

    // Enable GitHub Pages
    await octokit.repos.requestPagesBuild({
      owner: process.env.GITHUB_ORG,
      repo: repoName
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: portfolioUrl })
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
