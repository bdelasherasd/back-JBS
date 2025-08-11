var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var imp_carga = sequelize.define(
  "imp_carga",
  {
    idCarga: {
      type: type.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    proveedor: type.STRING,
    factura: {
      type: type.STRING,
      // Add index for factura (allows duplicates by default)
      indexes: [{ fields: ["factura"] }],
    },
    sku: type.STRING,
    cantidad: type.STRING,
    peso: type.STRING,
    precio: type.STRING,
  },
  {
    indexes: [
      {
        fields: ["factura"],
      },
    ],
  }
);
sequelize.sync();

module.exports = imp_carga;
