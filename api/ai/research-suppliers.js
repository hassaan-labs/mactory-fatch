'use strict';
const { handleResearch } = require('../../lib/ai');
module.exports = async function handler(req, res) { return handleResearch(req, res); };
