export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).json({
      success: false,
      error,
      message: error_description || "Deriv authorization was cancelled."
    });
  }

  if (!code) {
    return res.status(400).json({
      success: false,
      message: "No Deriv authorization code received."
    });
  }

  return res.status(200).json({
    success: true,
    message: "PELItradershub received the Deriv authorization code.",
    received: true
  });
}
