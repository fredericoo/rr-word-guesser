import { createCookieSessionStorage } from 'react-router';
import { ulid } from 'ulid';
import * as v from 'valibot';

export const vSessionData = v.object({ user_id: v.string() });
type SessionData = v.InferOutput<typeof vSessionData>;

type SessionFlashData = {
	error: string;
};

const { getSession, commitSession, destroySession } = createCookieSessionStorage<SessionData, SessionFlashData>({
	// a Cookie from `createCookie` or the CookieOptions to create one
	cookie: {
		name: '__wg_session',
		httpOnly: true,
		path: '/',
		sameSite: 'lax',
		secrets: ['kek'],
		secure: true,
	},
});

export const getUserId = async (request: Request) => {
	const sessionCookie = await getSession(request.headers.get('Cookie'));
	const session = v.safeParse(vSessionData, sessionCookie.data);
	if (session.success === false) {
		const newUserId = ulid();
		sessionCookie.set('user_id', newUserId);
		return {
			userId: newUserId,
			getHeaders: async () => {
				const setCookieHeader = await commitSession(sessionCookie, {
					expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
				});
				return { 'Set-Cookie': setCookieHeader };
			},
		};
	}
	return { userId: session.output.user_id, getHeaders: undefined };
};

export { getSession, commitSession, destroySession };
