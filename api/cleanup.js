const { createClient } = require('@supabase/supabase-js');
const { Octokit } = require('@octokit/rest');

exports.handler = async (event) => {
  if (event.headers['supabase_db_webhook_secret'] !== process.env.SUPABASE_DB_WEBHOOK_SECRET) {
    console.error('Unauthorized webhook request');
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY // service_role key
  );
  const octokit = new Octokit({ auth: process.env.GH_TOKEN }); // Changed from GITHUB_TOKEN

  try {
    const payload = JSON.parse(event.body);
    const deletedPortfolio = payload.record || {};

    if (deletedPortfolio.portfolio_url) {
      const repoName = deletedPortfolio.portfolio_url.split('/').pop();
      try {
        await octokit.repos.delete({
          owner: process.env.GH_ORG, // Changed from GITHUB_ORG
          repo: repoName
        });
        console.log(`Deleted GitHub repository: ${repoName}`);
      } catch (error) {
        console.error(`Error deleting GitHub repo ${repoName}:`, error.message);
      }
    }

    const { data, error } = await supabase
      .from('portfolios')
      .select('id, portfolio_url')
      .lt('expires_at', new Date().toISOString());

    if (error) throw new Error(error.message);

    for (const portfolio of data) {
      const repoName = portfolio.portfolio_url.split('/').pop();
      try {
        await octokit.repos.delete({
          owner: process.env.GH_ORG, // Changed from GITHUB_ORG
          repo: repoName
        });
        console.log(`Deleted GitHub repository: ${repoName}`);
      } catch (error) {
        console.error(`Error deleting GitHub repo ${repoName}:`, error.message);
      }
      await supabase.from('portfolios').delete().eq('id', portfolio.id);
      console.log(`Deleted portfolio record: ${portfolio.id}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Cleanup completed' })
    };
  } catch (error) {
    console.error('Cleanup error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
