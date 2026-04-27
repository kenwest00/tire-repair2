const serverless = require("serverless-http");
const app = require("../index.js");
module.exports = serverless(app);
