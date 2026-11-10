'use strict';

const { handleApi } = require('../backend/handler');

module.exports = async function vercelHandler(req, res) {
  return handleApi(req, res);
};
