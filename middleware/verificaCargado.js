var sequelize = require("../models/sequelizeConnection");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
var imp_carga = require("../models/imp_carga");

const verificaCargado = async (refCliente, nroDespacho) => {
  // Lógica para verificar si ya está cargado
  let dataCarga = await imp_carga.findAll({
    where: {
      factura: refCliente,
    },
  });
  let detalles = [];
  if (dataCarga.length > 0) {
    for (let item of dataCarga) {
      let data = {
        invoiceNumber: item.factura,
        codigo: item.sku,
        cantidad: item.cantidad,
        peso: item.peso,
        valor: item.precio,
        descripcion: "",
        codigoInvalido: false,
        cantidadInvalida: false,
        valorInvalido: false,
      };
      detalles.push(data);
    }
    imp_importacion_archivo.update(
      { detalles: JSON.stringify(detalles) },
      { where: { nroDespacho: nroDespacho } }
    );
  }
};

module.exports = verificaCargado;
