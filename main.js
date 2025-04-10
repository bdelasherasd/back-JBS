var express = require("express");
const path = require("path");

require("dotenv").config({ path: "variables.env" });
var expressSanitizer = require("express-sanitizer");
var passport = require("passport");

var app = express();
app.use(
  require("express-session")({
    secret: "zp7777",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(expressSanitizer());
app.use(express.json());

var sequelize = require("./models/sequelizeConnection");
var task = require("./models/task");

var usuarioRoutes = require("./routes/usuario");
app.use("/usuario", usuarioRoutes);

var aplicacionRoutes = require("./routes/aplicacion");
app.use("/aplicacion", aplicacionRoutes);

var privilegioRoutes = require("./routes/privilegio");
app.use("/privilegio", privilegioRoutes);

var {
  apiBancoCentralRoutes,
  reprogramaapiBancoCentral,
} = require("./routes/apiBancoCentral");
app.use("/apiBancoCentral", apiBancoCentralRoutes);

var { RpaRossiRoutes, reprogramaRpaRossi } = require("./routes/RpaRossi");
app.use("/RpaRossi", RpaRossiRoutes);

app.use(express.static(path.join(__dirname, "../front/dist")));

// Para cualquier otra ruta que no sea /api, devolver index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../front/dist", "index.html"));
});

var Port = process.env.PORT || "9999";
var Ip = process.env.HOST || "0.0.0.0";

app.listen(Port, Ip, function () {
  console.log("Servidor ha Iniciado...");
  console.log("Port..." + Port);
  console.log("IP..." + Ip);

  global.tjobs = [];
  procesaTareas()
    .then((d) => {
      console.log(global.tjobs.length);
    })
    .catch((err) => {
      console.log(err);
    });
});

var procesaTareas = function () {
  return new Promise(function (resolve, reject) {
    task
      .findAll({
        order: [["idTask", "asc"]],
      })
      .then((data) => {
        data.forEach((e) => {
          if (e.aplicacion === "apiBancoCentral") {
            reprogramaapiBancoCentral(JSON.parse(e.taskdata), e.idTask);
          }
          if (e.aplicacion === "RpaRossi") {
            reprogramaRpaRossi(JSON.parse(e.taskdata), e.idTask);
          }
        });
        resolve(data);
      })
      .catch((err) => {
        reject(err);
      });
  });
};
