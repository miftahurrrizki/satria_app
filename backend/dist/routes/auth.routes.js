"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const auth_controller_1 = require("../controllers/auth.controller");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const router = (0, express_1.Router)();
// Rate-limited: max 5 percobaan / 15 menit per IP
router.post('/login', rate_limit_middleware_1.loginRateLimiter, auth_controller_1.login);
router.post('/logout', auth_controller_1.logout);
router.get('/me', auth_middleware_1.authenticate, auth_controller_1.me);
router.put('/change-password', auth_middleware_1.authenticate, auth_controller_1.changePassword);
router.post('/reset-password', auth_middleware_1.authenticate, auth_controller_1.resetToDefault);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map