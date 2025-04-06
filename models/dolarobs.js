var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var dolarobs = sequelize.define("dolarobs", {
  id: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  fecha: { type: type.DATEONLY, unique: "dolarobsIndex1" },
  valor: type.DOUBLE,
});
sequelize.sync();

module.exports = dolarobs;
