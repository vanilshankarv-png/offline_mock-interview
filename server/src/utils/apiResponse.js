/** Sends a successful API response using the TalkReady response envelope. */
export function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}
