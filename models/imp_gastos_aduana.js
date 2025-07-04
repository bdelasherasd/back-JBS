var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var imp_gastos_aduana = sequelize.define("imp_gastos_aduana", {
  idGastosAduana: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  idImportacion: { type: type.INTEGER, index: true },

  nroDespacho: type.STRING,
  nroReferencia: type.STRING,
  nave: type.STRING,
  mercaderia: type.STRING,
  bultos: type.STRING,
  tipocambio: type.STRING,
  monedaCif: type.STRING,
  valorCif: type.STRING,
  MonedaIvaGcp: type.STRING,
  valorIvaGcp: type.STRING,
  monedaAdValorem: type.STRING,
  AdValorem: type.STRING,
  MonedaAlmacenaje: type.STRING,
  Almacenaje: type.STRING,
  nroFactura: type.STRING,
  fechaFactura: type.STRING,
  fechaGuia: type.STRING,
  fechaPago: type.STRING,
  fechaAceptacion: type.STRING,
  gastosAgencia: "[nvarchar](max)",
  desembolsosAgencia: "[nvarchar](max)",
  nombreArchivoUyD: type.STRING,
});
sequelize.sync({ alter: true });

//sequelize.sync();

module.exports = imp_gastos_aduana;
