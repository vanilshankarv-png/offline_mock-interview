# TalkReady API server

Express and Mongoose API. Copy `.env.example` to `.env`, set long random JWT
secrets and MongoDB credentials, then run `npm install` and `npm run dev`.

Create the initial admin with `npm run seed` after setting `ADMIN_EMAIL` and
`ADMIN_PASSWORD`. Registration always creates a regular user.

## Auth curl walkthrough

Register and save the refresh cookie:

```sh
curl -i -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"name":"Sam","email":"sam@example.com","password":"Study1234"}' \
  http://localhost:5000/api/v1/auth/register
```

Copy the returned `accessToken` into `TOKEN`, then call a protected endpoint:

```sh
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/v1/auth/me
curl -b cookies.txt -c cookies.txt -X POST http://localhost:5000/api/v1/auth/refresh
curl -b cookies.txt -X POST http://localhost:5000/api/v1/auth/logout
```

The admin role check can be verified with an admin access token from login:

```sh
curl -i -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/v1/admin/ping
```

Regular users receive `403`; admins receive `200`. Login and registration are
limited to 10 requests per IP per 15 minutes.
