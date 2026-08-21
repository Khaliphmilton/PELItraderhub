export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "PELItradershub API",
    version: "1.0.0",
    message: "Backend is running"
  });
}
