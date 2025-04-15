var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var imp_importacion = sequelize.define("imp_importacion", {
  idImportacion: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nroDespacho: type.STRING,
  tipoTranporte: type.STRING,
  tipoOperacion: type.STRING,
  fechaETA: type.STRING,
  proveedor: type.STRING,
  regimen: type.STRING,
  refCliente: type.STRING,
  impuestoDI: type.STRING,
  puertoEmbarque: type.STRING,
  paisEmbarque: type.STRING,
  aduana: type.STRING,
  puertoDescarga: type.STRING,
});
sequelize.sync();

module.exports = imp_importacion;
