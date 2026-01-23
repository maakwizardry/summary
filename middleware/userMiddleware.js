const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1]; // get token
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // verify token
    req.user = await User.findById(decoded.id).select("-password"); // attach user to req
    next();
  } catch (err) {
    res.status(401).json({ message: "Token is invalid or expired" });
  }
};

module.exports = protect;
