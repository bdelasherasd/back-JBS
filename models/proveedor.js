var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var proveedor = sequelize.define("proveedor", {
  idProveedor: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  codigo: { type: type.STRING },
  proveedor: type.STRING,
});
sequelize.sync();

module.exports = proveedor;
