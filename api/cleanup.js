const { createClient } = require('@supabase/supabase-js');
const { Octokit } = require('@octokit/rest');

module.exports = async (req, res) => {
  try {
    console.log('Starting portfolio cleanup...');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    // Fetch expired portfolios
    const { data: deletions, error } = await supabase
      .from('scheduled_deletions')
      .select('user_id, portfolio_path')
      .lte('deletion_date', new Date().toISOString());

    if (error) {
      console.error('Supabase fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch expired portfolios' });
    }

    const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
    const repoOwner = 'eportfoliogen';
    const repoName = 'eportfoliogen.github.io';

    for (const deletion of deletions) {
      try {
        const content = await octokit.repos.getContent({
          owner: repoOwner,
          repo: repoName,
          path: deletion.portfolio_path
        });
        await octokit.repos.deleteFile({
          owner: repoOwner,
          repo: repoName,
          path: deletion.portfolio_path,
          message: `Delete expired portfolio for user ${deletion.user_id}`,
          sha: content.data.sha,
          committer: { name: 'Portfolio Bot', email: 'bot@eportfoliogen.com' },
          author: { name: 'Portfolio Bot', email: 'bot@eportfoliogen.com' }
        });

        await supabase.from('portfolios').delete().eq('user_id', deletion.user_id);
        await supabase.from('scheduled_deletions').delete().eq('user_id', deletion.user_id);
        console.log(`Deleted portfolio: ${deletion.portfolio_path}`);
      } catch (err) {
        console.error(`Error deleting ${deletion.portfolio_path}:`, err.message);
      }
    }

    return res.status(200).json({ message: 'Cleanup completed' });
  } catch (error) {
    console.error('Cleanup error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
