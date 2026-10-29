'use strict';
const { handleParse } = require('../../lib/ai');
module.exports = async function handler(req, res) { return handleParse(req, res); };
