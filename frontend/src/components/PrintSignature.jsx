export default function PrintSignature({ month, year }) {
  return (
    <div className="print-only print-signature">
      <h4>Émargement et validation réglementaire</h4>
      <p>Registre de vérifications périodiques — Mois de {month} {year}</p>
      <div className="print-signature__fields">
        <div>Signature du technicien : ___________________</div>
        <div>Visa de la direction / régie : ___________________</div>
      </div>
    </div>
  );
}