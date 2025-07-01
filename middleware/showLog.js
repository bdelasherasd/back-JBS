require("dotenv").config({ path: "variables.env" });

var timezone = process.env.TIMEZONE;

const showLog = (req, res) => {
  // console.log("Request: " + req.url);
  // console.log("Params: " + JSON.stringify(req.params));
  // console.log("Body: " + JSON.stringify(req.body));
  // console.log("Headers: " + JSON.stringify(req.headers));
  // console.log("Method: " + req.method);
  // console.log("Query: " + JSON.stringify(req.query));
  // console.log("Response: " + res.statusCode);

  let ip =
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket.remoteAddress;
  let session = req.session.id;
  console.log(
    " ip: " +
      ip +
      " a las " +
      new Date().toLocaleString("es-ES", { timeZone: timezone }) +
      " " +
      Date.now()
  );
};

module.exports = showLog;
