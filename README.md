# Veyra — Discover it. Desire it. Bid for it.

Veyra is a modern online marketplace designed to make discovering unique products and participating in auctions simple and engaging. Users can explore products, discover live and upcoming auctions, and participate in bidding through a clean, user-friendly interface.

**Live Demo:** https://veyra-2qb1.onrender.com/

## About the Project

Veyra brings product discovery and online auctions together in one place. The platform aims to provide a convenient experience for buyers while supporting a marketplace where products can be showcased and discovered.

## Features

- **Product Discovery:** Explore products through an organized marketplace.
- **Category Browsing:** Browse products by category.
- **Live Auctions:** Discover auctions currently in progress.
- **Upcoming Auctions:** Explore scheduled auctions.
- **Quick Bidding:** Access the bidding interface for supported auctions.
- **User Authentication:** Sign up and sign in using the configured Supabase authentication system.
- **Responsive Interface:** Browse the marketplace across different screen sizes.
- **Auction Experience:** View auction information and interact with available auction features.



## Tech Stack

| Technology | Purpose |
|---|---|
| React | Building the user interface |
| Vite | Development server and build tool |
| JavaScript | Application logic |
| CSS | Styling and responsive layouts |
| React Router | Client-side navigation |
| Supabase | Authentication and backend services |
| Node.js | JavaScript runtime for server-side functionality |
| Render | Application hosting |

## Getting Started

Follow these steps to run Veyra locally.

### Prerequisites

Install the following before starting:

- [Node.js](https://nodejs.org/)
- npm (included with Node.js)
- [Git](https://git-scm.com/)
- A Supabase project, if you want to use the authentication features

### 1. Clone the Repository

```bash
git clone https://github.com/jyothsnamenezes2007-prog/Veyra.git
```

### 2. Navigate to the Project

```bash
cd Veyra
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the project root and add the environment variable names required by your application.

For example, if your code uses these names:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_key
```

Replace the placeholders with the appropriate values from your Supabase project.

**Security:** Never commit your `.env` file, passwords, service-role keys, or other secrets to GitHub. Only expose browser-safe public keys intended for frontend use.

### 5. Start the Development Server

```bash
npm run dev
```

Open the local URL displayed in your terminal.

### 6. Create a Production Build

```bash
npm run build
```

Vite generates the production build in the `dist` directory.

## Project Structure

The project is organized into frontend pages, reusable components, application context, and backend-related files.

```text
Veyra/
├── public/
├── server/
│   └── data/
├── src/
│   ├── components/
│   ├── context/
│   ├── pages/
│   └── ...
├── supabase/
├── package.json
├── package-lock.json
└── README.md
```

The exact structure may change as development continues.

## Authentication and Configuration

Veyra uses Supabase for its configured authentication features.

To enable authentication locally:

1. Create or open your Supabase project.
2. Configure the environment variables expected by the application.
3. Configure the appropriate site URL and redirect URLs in Supabase Authentication settings.
4. Configure the required authentication providers.
5. Test sign-up, email verification, sign-in, and password recovery.

Do not include private credentials in this README.

## Deployment

The live application is hosted on Render.

**Live application:** https://veyra-2qb1.onrender.com/

When deploying your own instance, configure the required environment variables in your hosting provider and ensure the Supabase redirect URLs match your deployment domain.

## Future Improvements

Potential improvements as development progresses include:

- Real-time auction updates
- Watchlists and saved products
- Auction reminders and notifications
- Order and purchase management
- Dedicated buyer and seller dashboards
- Improved testing, accessibility, and performance

## Team

**Team Genesis**

Veyra is a collaborative project developed as part of our journey in web development and collaborative software engineering.

---

*Veyra — Discover it. Desire it. Bid for it.*
