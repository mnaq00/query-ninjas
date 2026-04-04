import React from "react";
import { useNavigate } from "react-router-dom";

export default function PageBackButton() {
  const navigate = useNavigate();

  return (
    <div className="page-back-row">
      <button type="button" className="btn page-back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>
    </div>
  );
}
