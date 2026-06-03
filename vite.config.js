function buildWhatsApp(round) {
  const filled = round.players.length;
  const spots = round.maxPlayers - filled;
  const names = round.players.map(p => `- ${p.name} (HCP ${hcpLabel(p.handicap)})`).join("\n");
  const mapsLink = round.lat ? `\nComo llegar: https://www.google.com/maps?q=${round.lat},${round.lng}` : "";
  const shareUrl = `${window.location.href.split("?")[0]}?salida=${round.id}`;
  const msg = [
    `SALIDA MBQB`,
    `Campo: ${round.course}`,
    `Fecha: ${formatDate(round.date)}`,
    `Hora: ${round.time} hrs`,
    `Jugadores: ${filled}/${round.maxPlayers}${spots > 0 ? ` - quedan ${spots} cupos` : " - COMPLETO"}`,
    names ? `\nInscritos:\n${names}` : "",
    round.notes ? `\nNotas: ${round.notes}` : "",
    mapsLink,
    `\nAnotate aqui: ${shareUrl}`,
  ].filter(Boolean).join("\n");
  return encodeURIComponent(msg);
}
