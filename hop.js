app.use((req, res, next) => {
  console.log(req.headers['x-forwarded-for']);
  next();
});
