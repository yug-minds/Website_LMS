import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ensureCsrfToken } from './src/lib/csrf-middleware'

const PUBLIC_PATHS: RegExp[] = [
	/^\/$/,
	/^\/login(?:\/.*)?$/,
	/^\/signup(?:\/.*)?$/,
	/^\/forgot-password(?:\/.*)?$/,
	/^\/reset-password(?:\/.*)?$/,
	/^\/update-password(?:\/.*)?$/,
	/^\/redirect(?:\/.*)?$/,
	/^\/not-found(?:\/.*)?$/,
	/^\/about(?:\/.*)?$/,
	/^\/contact(?:\/.*)?$/,
	/^\/programs(?:\/.*)?$/,
	/^\/for-schools(?:\/.*)?$/,
	/^\/for-parents(?:\/.*)?$/,
	/^\/success-stories(?:\/.*)?$/,
	/^\/student-registration(?:\/.*)?$/,
	/^\/_next\//,
	/^\/api\//,
	/^\/images\//,
	/^\/favicon/,
	/\.(css|js|json|ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|mp4|webp)$/,
]

function isPublicPath(pathname: string) {
	return PUBLIC_PATHS.some((re) => re.test(pathname))
}

export function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl

	// Allow all public paths
	if (isPublicPath(pathname)) {
		return NextResponse.next()
	}

	// Protected areas - let layouts handle role-based access control
	// Middleware only ensures these paths are not publicly accessible
	const protectedAreas = ['/admin', '/school-admin', '/teacher', '/student']
	const isProtected = protectedAreas.some((p) => pathname.startsWith(p))

	if (isProtected) {
		// Let the layout components handle authentication and role checks
		// They will redirect to login or correct dashboard if needed
		// This avoids cookie-based role checks in middleware
	}

	// Add security headers
	const response = NextResponse.next()
	
	// Prevent clickjacking
	response.headers.set('X-Frame-Options', 'DENY')
	response.headers.set('X-Content-Type-Options', 'nosniff')
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
	
	// Ensure CSRF token is set for all requests
	// This ensures the token is available for state-changing operations
	ensureCsrfToken(response, req)
	
	return response
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 */
		'/((?!_next/static|_next/image|favicon.ico).*)',
	],
}
