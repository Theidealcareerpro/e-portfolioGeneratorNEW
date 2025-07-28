const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const generateCoverLetter = async (req, res) => {
  try {
    const { name, email } = req.body;
    const { coverletter } = req.files || {};

    if (!name || name.length < 2) return res.status(400).json({ message: 'Name must be at least 2 characters' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Valid email is required' });
    if (!coverletter || coverletter.mimetype !== 'application/pdf') return res.status(400).json({ message: 'Cover letter must be a PDF' });
    if (coverletter.size > 10 * 1024 * 1024) return res.status(400).json({ message: 'Cover letter must be under 10MB' });

    // Save metadata to Supabase
    const { data, error } = await supabase
      .from('coverletters')
      .insert({
        name, email,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error.message);
      return res.status(500).json({ message: 'Failed to save cover letter metadata' });
    }

    const coverLetterId = data.id;

    // Upload PDF to GitHub
    const path = `coverletters/${coverLetterId}/coverletter.pdf`;
    try {
      const response = await octokit.repos.createOrUpdateFileContents({
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        path,
        message: `Cover letter for ${name}`,
        content: Buffer.from(coverletter.data).toString('base64')
      });
      const coverLetterUrl = response.data.content.download_url;

      // Update cover letter with URL
      const { error: updateError } = await supabase
        .from('coverletters')
        .update({ coverletter_url: coverLetterUrl })
        .eq('id', coverLetterId);

      if (updateError) {
        console.error('Supabase update error:', updateError.message);
        return res.status(500).json({ message: 'Failed to update cover letter URL' });
      }

      res.status(200).json({ coverletter_url: coverLetterUrl });
    } catch (githubError) {
      console.error('GitHub upload error:', githubError.message);
      return res.status(500).json({ message: 'Failed to upload cover letter to GitHub' });
    }
  } catch (error) {
    console.error('Cover letter generation error:', error.message, error.stack);
    res.status(500).json({ message: 'Failed to generate cover letter' });
  }
};

module.exports = generateCoverLetter;
