import { Link } from "react-router-dom";

import loginBackground from "../assets/login_screen.png";
import "./login-page.css";

export function SignupPage() {
  return (
    <main className="login-screen login-screen--sage">
      <span className="login-logo" role="img" aria-label="Lisno" />
      <img className="login-bg" src={loginBackground} alt="" loading="eager" fetchPriority="high" />
      <div className="login-scrim" aria-hidden="true" />
      <p className="login-script" aria-hidden="true">Spaces<br />for a better<br />tomorrow</p>
      <div className="login-grid">
        <section className="login-hero" aria-label="Lisno client portal">
          <h2 className="login-hero__title">Follow every design decision.</h2>
          <p className="login-hero__body">Share requirements, review estimates, and follow your project in one place.</p>
        </section>
        <div className="login-card-wrap">
          <section className="login-card" aria-labelledby="signup-title">
            <h1 id="signup-title" className="login-card__title">Join through your project invitation</h1>
            <p className="login-card__subtitle">Your Lisno contact will email an invitation when your project is initiated. Open that invitation to create your account or add the project to your existing account.</p>
            <p>If you haven't received an invitation, check your spam folder or ask your Lisno contact to resend it.</p>
            <Link to="/login" className="login-submit">Sign in</Link>
            <p className="login-footer-text">Already have an account? Your existing sign-in details still work.</p>
          </section>
        </div>
      </div>
      <p className="login-strip" aria-hidden="true"><span>Spaces</span><span>People</span><span>Ideas</span><span>Better Living</span></p>
    </main>
  );
}
