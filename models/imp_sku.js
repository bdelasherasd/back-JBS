var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var imp_sku = sequelize.define("imp_sku", {
  idSku: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sku: { type: type.STRING, unique: "skuIndex1" },
  producto: type.STRING,
  proteina: type.STRING,
  origen: type.STRING,
  marca: type.STRING,
  proveedor: type.STRING,
  estado: type.STRING,
  calidad: type.STRING,
  tipo: type.STRING,
});
sequelize.sync();

module.exports = imp_sku;
