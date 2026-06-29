const bcrypt = require('bcryptjs');
const { isEnabled } = require('@librechat/api');
const { getTenantId, logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { findUser, createUser } = require('~/models');
const { setAuthTokens } = require('~/server/services/AuthService');

const GUEST_EMAIL = 'guest@librechat.local';

const sanitizeUser = (user) => {
  const source = (typeof user?.toObject === 'function' ? user.toObject() : user) || {};
  const {
    password: _password,
    totpSecret: _totpSecret,
    backupCodes: _backupCodes,
    __v,
    ...safe
  } = source;
  safe.id = safe._id?.toString?.() ?? safe.id;
  return safe;
};

const getGuestUser = async () => {
  const tenantId = getTenantId();
  const lookup = tenantId ? { email: GUEST_EMAIL, tenantId } : { email: GUEST_EMAIL };
  const existing = await findUser(lookup);
  if (existing) {
    return existing;
  }

  return createUser(
    {
      provider: 'local',
      email: GUEST_EMAIL,
      username: 'guest',
      name: 'Guest',
      avatar: null,
      role: SystemRoles.USER,
      password: bcrypt.hashSync(`guest-${Date.now()}-${Math.random()}`, 10),
      emailVerified: true,
      termsAccepted: true,
      ...(tenantId ? { tenantId } : {}),
    },
    undefined,
    true,
    true,
  );
};

const guestController = async (req, res) => {
  if (!isEnabled(process.env.ALLOW_GUEST_LOGIN)) {
    return res.status(404).json({ message: 'Guest login is disabled' });
  }

  try {
    const user = await getGuestUser();
    const token = await setAuthTokens(user._id, res, null, req);
    return res.status(200).send({ token, user: sanitizeUser(user) });
  } catch (err) {
    logger.error('[guestController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  getGuestUser,
  guestController,
  sanitizeUser,
};
