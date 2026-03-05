import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { initDatabase } from "./db/index";
import { initMailService } from "./services/mailService";
import {
  globalApiLimiter,
  authLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} from "./utils/rateLimiter";
import {
  getOrCreateUser,
  findUserById,
  findUserByEmail,
  setPasswordResetToken,
  findUserByValidPasswordResetToken,
  resetPassword,
  setFavouritesSynchronized,
  setHistorySynchronized,
} from "./services/userService";
import { getMangaById, getMangaList } from "./services/mangaService";
import { syncHistory } from "./services/historyService";
import { syncFavourites } from "./services/favouriteService";
import { getMailService } from "./services/mailService";
import { renderTemplate } from "./services/templateService";
import { hashPassword } from "./utils/password";
import type { HistoryPackage } from "./models/history";
import type { FavouritesPackage } from "./models/favourite";

// ---------- Config ----------
const PORT = Number(process.env.PORT ?? 8080);
const JWT_SECRET = process.env.JWT_SECRET ?? "secret";
const JWT_ISSUER = process.env.JWT_ISSUER ?? "http://0.0.0.0:8080/";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "http://0.0.0.0:8080/resource";
const ALLOW_NEW_REGISTER = (process.env.ALLOW_NEW_REGISTER ?? "true") === "true";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const MAIL_PROVIDER = process.env.MAIL_PROVIDER ?? "console";

// ---------- Database ----------
await initDatabase({
  host: process.env.DATABASE_HOST ?? "localhost",
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER ?? "",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "kotatsu_db",
});

// ---------- Mail ----------
initMailService(MAIL_PROVIDER, {
  host: process.env.SMTP_HOST ?? "",
  port: Number(process.env.SMTP_PORT ?? 587),
  username: process.env.SMTP_USERNAME ?? "",
  password: process.env.SMTP_PASSWORD ?? "",
  from: process.env.SMTP_FROM ?? "",
});

// ---------- JWT ----------
const jwtPlugin = jwt({
  name: "jwtAuth",
  secret: JWT_SECRET,
  alg: "HS256",
});

// ---------- Helpers ----------
function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ---------- App ----------
const app = new Elysia()
  .use(jwtPlugin)

  // Health
  .get("/", () => new Response("Alive", { status: 200 }))

  // Deeplink reset-password page
  .get("/deeplink/reset-password", ({ query, set }) => {
    const token = query.token;
    if (!token) {
      set.status = 400;
      return "Missing token";
    }
    const deepLink = `kotatsu://reset-password?token=${token}`;
    const html = renderTemplate("pages/reset-password.hbs", { deep_link: deepLink });
    set.headers["content-type"] = "text/html; charset=utf-8";
    return html;
  })

  // ---------- Auth routes ----------
  .post(
    "/auth",
    async ({ body, request, set, jwtAuth }) => {
      const ip = getClientIp(request);
      if (!authLimiter.check(ip)) {
        set.status = 429;
        return "Too Many Requests";
      }
      if (!globalApiLimiter.check(ip)) {
        set.status = 429;
        return "Too Many Requests";
      }

      try {
        const userInfo = await getOrCreateUser(body, ALLOW_NEW_REGISTER);
        if (!userInfo) {
          set.status = 400;
          return "Wrong password";
        }

        const token = await jwtAuth.sign({
          user_id: userInfo.id,
          aud: JWT_AUDIENCE,
          iss: JWT_ISSUER,
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        });

        return { token };
      } catch (err) {
        set.status = 400;
        return err instanceof Error ? err.message : "Bad Request";
      }
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    }
  )

  .post(
    "/forgot-password",
    async ({ body, request, set }) => {
      const ip = getClientIp(request);
      if (!forgotPasswordLimiter.check(ip)) {
        set.status = 429;
        return "Too Many Requests";
      }
      if (!globalApiLimiter.check(ip)) {
        set.status = 429;
        return "Too Many Requests";
      }

      const user = await findUserByEmail(body.email);
      const now = Math.floor(Date.now() / 1000);

      const canSend =
        user !== null &&
        !(user.passwordResetTokenHash !== null &&
          (user.passwordResetTokenExpiresAt ?? 0) > now);

      if (canSend && user) {
        const token = await setPasswordResetToken(user.id);
        const link = `${BASE_URL}/deeplink/reset-password?token=${token}`;
        const html = renderTemplate("mail/forgot-password.hbs", {
          reset_password_link: link,
        });

        await getMailService().send({
          to: user.email,
          subject: "Password reset",
          textBody: `You can reset your password at ${link}`,
          htmlBody: html,
        });
      }

      return new Response("A password reset email was sent", { status: 200 });
    },
    {
      body: t.Object({ email: t.String() }),
    }
  )

  .post(
    "/reset-password",
    async ({ body, request, set }) => {
      const ip = getClientIp(request);
      if (!resetPasswordLimiter.check(ip)) {
        set.status = 429;
        return "Too Many Requests";
      }
      if (!globalApiLimiter.check(ip)) {
        set.status = 429;
        return "Too Many Requests";
      }

      const user = await findUserByValidPasswordResetToken(body.reset_token);
      if (!user) {
        set.status = 400;
        return "Invalid or expired token";
      }

      if (body.password.length < 2 || body.password.length > 24) {
        set.status = 400;
        return "Password should be from 2 to 24 characters long";
      }

      const newHash = await hashPassword(body.password);
      await resetPassword(user.id, newHash);

      return new Response("Password has been reset successfully", { status: 200 });
    },
    {
      body: t.Object({ reset_token: t.String(), password: t.String() }),
    }
  )

  // ---------- Authenticated routes ----------
  .derive(async ({ headers, jwtAuth }) => {
    const authorization = headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return { currentUserId: null as number | null };
    }
    const token = authorization.slice(7);
    try {
      const payload = await jwtAuth.verify(token);
      if (!payload || typeof payload.user_id !== "number") {
        return { currentUserId: null as number | null };
      }
      return { currentUserId: payload.user_id as number | null };
    } catch {
      return { currentUserId: null as number | null };
    }
  })

  .get("/me", async ({ currentUserId, set, request }) => {
    const ip = getClientIp(request);
    if (!globalApiLimiter.check(ip)) {
      set.status = 429;
      return "Too Many Requests";
    }

    if (currentUserId === null) {
      set.status = 401;
      return "Unauthorized";
    }
    const user = await findUserById(currentUserId);
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    return { id: user.id, email: user.email, nickname: user.nickname };
  })

  .get("/resource/history", async ({ currentUserId, set, request }) => {
    const ip = getClientIp(request);
    if (!globalApiLimiter.check(ip)) {
      set.status = 429;
      return "Too Many Requests";
    }

    if (currentUserId === null) {
      set.status = 401;
      return "Unauthorized";
    }
    const user = await findUserById(currentUserId);
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    return syncHistory(user.id, user.historySyncTimestamp, null);
  })

  .post(
    "/resource/history",
    async ({ body, currentUserId, set, request }) => {
      const ip = getClientIp(request);
      if (!globalApiLimiter.check(ip)) {
        set.status = 429;
        return "Too Many Requests";
      }

      if (currentUserId === null) {
        set.status = 401;
        return "Unauthorized";
      }
      const user = await findUserById(currentUserId);
      if (!user) {
        set.status = 401;
        return "Unauthorized";
      }

      const response = await syncHistory(user.id, user.historySyncTimestamp, body as HistoryPackage);
      await setHistorySynchronized(user.id, Date.now());

      if (historyPackageEquals(response, body as HistoryPackage)) {
        set.status = 204;
        return;
      }
      return response;
    },
    {
      body: t.Object({
        history: t.Array(t.Any()),
        timestamp: t.Optional(t.Nullable(t.Number())),
      }),
    }
  )

  .get("/resource/favourites", async ({ currentUserId, set, request }) => {
    const ip = getClientIp(request);
    if (!globalApiLimiter.check(ip)) {
      set.status = 429;
      return "Too Many Requests";
    }

    if (currentUserId === null) {
      set.status = 401;
      return "Unauthorized";
    }
    const user = await findUserById(currentUserId);
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    return syncFavourites(user.id, user.favouritesSyncTimestamp, null);
  })

  .post(
    "/resource/favourites",
    async ({ body, currentUserId, set, request }) => {
      const ip = getClientIp(request);
      if (!globalApiLimiter.check(ip)) {
        set.status = 429;
        return "Too Many Requests";
      }

      if (currentUserId === null) {
        set.status = 401;
        return "Unauthorized";
      }
      const user = await findUserById(currentUserId);
      if (!user) {
        set.status = 401;
        return "Unauthorized";
      }

      const response = await syncFavourites(user.id, user.favouritesSyncTimestamp, body as FavouritesPackage);
      await setFavouritesSynchronized(user.id, Date.now());

      if (favouritesPackageEquals(response, body as FavouritesPackage)) {
        set.status = 204;
        return;
      }
      return response;
    },
    {
      body: t.Object({
        categories: t.Array(t.Any()),
        favourites: t.Array(t.Any()),
        timestamp: t.Optional(t.Nullable(t.Number())),
      }),
    }
  )

  .get("/manga", async ({ query, set, request }) => {
    const ip = getClientIp(request);
    if (!globalApiLimiter.check(ip)) {
      set.status = 429;
      return "Too Many Requests";
    }

    const offset = parseInt(query.offset ?? "", 10);
    const limit = parseInt(query.limit ?? "", 10);
    if (isNaN(offset) || isNaN(limit)) {
      set.status = 400;
      return 'Parameter "offset" or "limit" is missing or invalid';
    }
    return getMangaList(offset, limit);
  })

  .get("/manga/:id", async ({ params, set, request }) => {
    const ip = getClientIp(request);
    if (!globalApiLimiter.check(ip)) {
      set.status = 429;
      return "Too Many Requests";
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 404;
      return "Not Found";
    }
    const manga = await getMangaById(id);
    if (!manga) {
      set.status = 404;
      return "Not Found";
    }
    return manga;
  })

  .onError(({ error, set }) => {
    if (error instanceof Error) {
      const msg = error.message;
      if (msg.includes("400") || msg.includes("Bad Request")) {
        set.status = 400;
        return `400: ${msg}`;
      }
      if (msg.includes("404") || msg.includes("Not Found")) {
        set.status = 404;
        return `404: ${msg}`;
      }
      set.status = 500;
      console.error(error);
      return `500: ${msg}`;
    }
    set.status = 500;
    return "500: Internal Server Error";
  })

  .listen(PORT);

console.log(`Kotatsu Sync Server running at http://localhost:${PORT}`);

// ---------- Helpers ----------
function historyPackageEquals(a: HistoryPackage, b: HistoryPackage): boolean {
  return JSON.stringify(a.history) === JSON.stringify(b.history);
}

function favouritesPackageEquals(a: FavouritesPackage, b: FavouritesPackage): boolean {
  return (
    JSON.stringify(a.categories) === JSON.stringify(b.categories) &&
    JSON.stringify(a.favourites) === JSON.stringify(b.favourites)
  );
}
