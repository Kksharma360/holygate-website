# HOLYGATE Storefront + Admin (test build)

A responsive HOLYGATE grocery storefront based on the supplied visual reference. Product cards are loaded from a server-side JSON catalogue; the admin area can create, edit, publish/unpublish, and delete product listings. Public product buttons open the linked Amazon.in page in a new tab.

## Run locally

Requirements: Node.js 20 or newer. No npm packages are required.

1. Extract the ZIP.
2. Open a terminal inside the `holygate-website` folder.
3. For a quick test, skip `.env` so the included test admin credentials work. Before deployment, copy `.env.example` to `.env` and set a unique admin password plus any approved Amazon API credentials. The server loads `.env` automatically if it exists.
4. Start the server:

```bash
node server.js
# or: npm start
```

On Windows, you can double-click `START-HOLYGATE.bat` instead.

5. Open `http://localhost:3000` for the storefront.
6. Open `http://localhost:3000/admin.html` for the admin dashboard.

**Test admin credentials**

- Email: `admin@holygate.in`
- Password: `HolyGateDemo#2026`

These are development-only credentials. For convenience, the starter uses environment variables when they are present, but the built-in demo defaults are intentionally included so the test site can be opened immediately. Change `ADMIN_USER` and `ADMIN_PASSWORD` before running outside a local test environment.

### Environment variables

The server loads a local `.env` file without additional packages. Environment variables already present in the process take priority. Keep `.env` private and do not commit it.

## Add and manage products

In the admin dashboard, you can:

- Add a product manually with title, category, brand, pack size, description/features, image URL, additional image URLs, Amazon.in product URL, optional offer price, and visibility settings.
- Import a supported product from an Amazon.in URL using the **Import details** action (requires configured, approved Amazon Creators API access).
- Review imported details before saving, edit existing products, hide drafts, or delete listings.
- Set a product as a homepage pick. Published products appear in the storefront; draft products remain in admin only.

The catalogue is stored in `data/products.json`. Back up this file before deploying updates. Image URLs should be HTTPS and reachable by your shoppers; imported Amazon image URLs are provided by Amazon's API.

## Automatic Amazon import: required setup

The URL import feature calls Amazon's official **Creators API** from the server. It does not scrape Amazon HTML. Amazon requires an accepted Associates account and approved Creators API access. When access is available, configure:

- `AMAZON_CLIENT_ID`
- `AMAZON_CLIENT_SECRET`
- `AMAZON_PARTNER_TAG` (your Amazon.in Associates tracking tag)
- `AMAZON_MARKETPLACE=www.amazon.in`
- `AMAZON_TOKEN_URL=https://api.amazon.co.uk/auth/o2/token` for EU-region v3.2 credentials, if that matches the credential version Amazon issued to your account.

The official API returns the product fields/resources requested by the app, such as title, images, features, and supported offer information. It does **not** guarantee every field, every variant image, or all information shown on an Amazon product page. A product may be unavailable to your API account. The admin importer surfaces API errors instead of making up product details.

Official references:

- Amazon.in Creators API — Using cURL and GetItems: https://affiliate-program.amazon.in/creatorsapi/docs/en-us/get-started/using-curl
- GetItems resources: https://affiliate-program.amazon.in/creatorsapi/docs/en-us/api-reference/operations/get-items
- Register for Creators API: https://affiliate-program.amazon.in/creatorsapi/docs/en-us/onboarding/register-for-creators-api
- Creators API SDK / setup guidance: https://affiliate-program.amazon.in/creatorsapi/docs/en-us/get-started/using-sdk
- Amazon.in Associates Operating Agreement: https://affiliate-program.amazon.in/help/operating/agreement

The application refreshes imported metadata on a 23-hour threshold and offer information on a 55-minute threshold when the API is configured, to keep time-sensitive data from staying stale. The Amazon partner tag should remain the one returned by Amazon in its product detail link. Review the latest Amazon terms and policies for your account before production use.

## Important before production deployment

This is a functional **test build**, not a hardened production store. It uses an in-memory session map and a local JSON file, has a demo admin fallback, and does not include database backups, multi-admin management, password reset, audit logs, server rate limiting, deployment configuration, or automated testing. Before launching publicly, set a strong admin password, require HTTPS, configure production-grade persistent storage and session management, protect secrets in your host's environment settings, and add backups/monitoring. Do not commit `.env` or Amazon credentials to source control.

Shoppers continue to the official HOLYGATE Amazon storefront for secure purchasing, Prime availability and doorstep delivery options. HOLYGATE is the direct manufacturer and brand owner of all listed products.

## Login troubleshooting (updated)

The admin login handler updates the user label after a successful sign-in. The current build fixes the selector mismatch that previously caused `Cannot set properties of null (setting 'textContent')`. HTML, JavaScript, and CSS responses are sent with no-cache headers to help prevent stale admin scripts.

If you still see the old error after replacing the project, stop any older HOLYGATE server windows, start `START-HOLYGATE.bat` from this extracted folder, and hard-refresh the browser with `Ctrl+F5`. Make sure `http://localhost:3000/admin.html` is being served by this folder.

## Amazon link import without API (experimental)
In Admin > Products, paste a full `https://www.amazon.in/dp/ASIN` product URL and click **Import details**. When Creators API credentials are absent, the server attempts to read publicly available product metadata. This may fail because Amazon blocks automated access; it is not guaranteed and may be subject to Amazon's site terms. If blocked, the ASIN and URL are preserved and the dashboard asks you to complete the product using your own brand photos and copy. No Amazon prices are imported in this mode, and Amazon-sourced images should only be used where you have the necessary rights. Review all data and click Save. Existing API-based import remains supported when configured.
