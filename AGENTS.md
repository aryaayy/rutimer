# agents.md: Rubik's Cube Timer Project Specification

## 1. Project Overview
This project is a simple, blazing-fast web-based Rubik's Cube timer built with **Vue 3**. The name of this web app is "rutimer". The goal is to create a sleek, highly responsive alternative to established tools like csTimer. It prioritizes a clutter-free user interface, zero-latency timing logic, and lightweight asset management to ensure instantaneous load times. 

**Core Features:**
*   Spacebar-triggered timer with millisecond precision.
*   Automatic scramble generation for WCA-standard events (e.g., 3x3x3).
*   Session statistics tracking (Ao5, Ao12, best time).
*   Persistent local storage for saving session histories without requiring user accounts.

---

## 2. Build and Test Commands
The project is built using Vue 3 and Vite. Use the following commands to manage the application lifecycle:

*   **Install Dependencies:**
    `npm install`
*   **Run Development Server:**
    `npm run dev`
    *(Runs the app locally with Hot Module Replacement)*
*   **Build for Production:**
    `npm run build`
    *(Compiles and minifies for production deployment)*
*   **Preview Production Build:**
    `npm run preview`
*   **Run Unit Tests:**
    `npm run test:unit`
*   **Run Linter:**
    `npm run lint`

---

## 3. Code Style Guidelines
To maintain a clean and scalable codebase, all contributions must adhere to the following standards:

*   **Framework:** Vue 3 utilizing the Composition API (`<script setup>`).
*   **Component Structure:** Use Single-File Components (`.vue`). Keep components atomic and modular (e.g., separate the Timer display, Scramble generator, and Statistics sidebar).
*   **Styling:** Use scoped CSS (`<style scoped>`) within components. Avoid deep, nested selectors. Prefer CSS variables for theme colors to allow for easy implementation of a dark mode later.
*   **Naming Conventions:**
    *   PascalCase for component filenames (e.g., `TimerDisplay.vue`).
    *   camelCase for variables and reactive state (e.g., `currentScramble`, `isTiming`).
*   **State Management:** For this simple application, prioritize Vue's native `ref` and `reactive` over external stores (like Pinia) unless cross-component state becomes complex.
*   **Anti-Slop:** For further guidelines, please look into GEMINI.md.

---

## 4. Testing Instructions
Testing is critical to ensure the timer functions flawlessly under rapid use.

*   **Unit Testing (Vitest):**
    *   Test the scramble generation algorithm to ensure it adheres to WCA randomness standards and doesn't produce redundant moves (e.g., `R R'`).
    *   Test the statistics calculators (ensure Ao5 drops the best and worst times correctly).
*   **Manual/UI Testing:**
    *   **Latency Check:** Ensure the timer starts and stops exactly when the spacebar state changes (keyup to start, keydown to stop). There must be zero perceived delay.
    *   **Rapid Input:** Spam the spacebar to ensure the state machine handles rapid start/stop events gracefully without freezing or resetting incorrectly.
*   **Storage Testing:** Reload the browser to confirm that past solve times and current averages persist via `localStorage`.

---

## 5. Security Considerations
While this is a client-side utility without user accounts, security and data integrity must still be considered:

*   **Client-Side Data Integrity:** Solves are saved to the browser's `localStorage`. Ensure the data parsing logic includes error handling (e.g., `try...catch` blocks around `JSON.parse`) so that corrupted local storage does not crash the app.
*   **XSS Prevention:** Vue automatically escapes HTML content, but ensure that any user-editable fields (like session naming, if implemented later) are not unsafely bound via `v-html`.
*   **Dependency Auditing:** Regularly run `npm audit` to check for vulnerabilities in the Vite build chain or Vue ecosystem.