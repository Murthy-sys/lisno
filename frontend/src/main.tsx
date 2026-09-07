import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import {
  capturePasswordResetTokenBeforeRouterMount
} from "./auth/passwordResetTokenVault";
import "./styles/index.css";
import "./styles/brand.css";
import "./styles/role-themes.css";
import "./styles/access-administration.css";
import "./styles/invitations.css";
import "./styles/client-responses.css";
import "./styles/estimate-delivery.css";
import "./styles/designer-design-plans.css";
import "./styles/admin-home.css";
import "./styles/designer-home.css";

capturePasswordResetTokenBeforeRouterMount();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
