const express = require('express');
const { createMiniAppHandlers } = require('@librechat/api');
const {
  createMiniApp,
  getMiniApp,
  listMiniApps,
  updateMiniApp,
  deleteMiniApp,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const handlers = createMiniAppHandlers({
  createMiniApp,
  getMiniApp,
  listMiniApps,
  updateMiniApp,
  deleteMiniApp,
});

router.use(requireJwtAuth);

router.get('/', handlers.list);
router.post('/', handlers.create);
router.get('/:id', handlers.get);
router.patch('/:id', handlers.patch);
router.delete('/:id', handlers.delete);

module.exports = router;
