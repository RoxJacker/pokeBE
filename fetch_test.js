fetch("http://localhost:3001/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "testrailway", email: "testrailway" + Date.now() + "@test.com", password: "password123" })
})
  .then(r => r.json().then(j => console.log("Status:", r.status, "Body:", j)))
  .catch(e => console.error(e));
