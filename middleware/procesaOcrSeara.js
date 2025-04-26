var sequelize = require("../models/sequelizeConnection");
var imp_sku = require("../models/imp_sku");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");

const procesaOcrSeara = async (ocr, nroDespacho) => {
  let data = [];

  //Procesa FACTURA COMERCIAL
  //Se busca la pagina que contiene la factura comercial
  //Se busca la tabla que contiene los datos de la factura comercial
  //Se busca la linea que contiene la cantidad y el valor
  //Se busca la linea que contiene el codigo
  //Se guarda la cantidad, el valor y el codigo en el objeto item
  //Se guarda el array data en la base de datos

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("FACTURA COMERCIAL")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("CAJAS PALETIZADAS")) {
        let item = {
          cantidad: "0",
          codigo: "",
          descripcion: "",
          valor: "0",
          peso: "0",
          codigoInvalido: false,
        };

        let linea = tabla[i - 1].split("\t");

        item.cantidad = linea[0];
        item.valor = linea[linea.length - 2];

        let linea2 = tabla[i].split("\t");

        let lineaConCodigo = linea2.join(" ").replace(/\r/g, "").split(" ");

        item.codigo = lineaConCodigo[lineaConCodigo.length - 2];

        item.codigoInvalido = await valCodigo(item.codigo);

        data.push(item);
      }
    }
  }

  if (data.length == 0) {
    await procesaOcrSearaEstrategia2(ocr, nroDespacho);
  } else {
    try {
      await imp_importacion_archivo.update(
        { detalles: JSON.stringify(data) },
        { where: { nroDespacho: nroDespacho } }
      );
    } catch (error) {
      console.log(error);
    }
  }

  //  Procesa PACKING LIST
  //Se busca la pagina que contiene el packing list
  //Se busca la tabla que contiene los datos del packing list

  let paginasPackingList = [];
  let dataPacking = [];

  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("PACKING LIST")) {
      paginasPackingList.push(i);
    }
  }

  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let textoLineaSiguiente = "";
      if (i < tabla.length - 1) {
        textoLineaSiguiente = tabla[i + 1].toUpperCase();
      }

      if (texto.includes("DESCRIPCIÓN")) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length) {
            break;
          }
          let linea = tabla[k].split("\t");
          let item = {
            descripcion: "",
            fechaProduccion: "",
            sif: "",
            fechaVencimiento: "",
            CajasPallet: "",
            PesoNeto: "",
            PesoBruto: "",
          };
          if (linea.length > 5) {
            item.descripcion = linea[0];
            item.fechaProduccion = linea[1];
            item.sif = linea[2];
            item.fechaVencimiento = linea[3];
            item.CajasPallet = linea[4];
            item.PesoNeto = linea[5];
            item.PesoBruto = linea[6];
            dataPacking.push(item);
          }
        }
        try {
          await imp_importacion_archivo.update(
            { packingList: JSON.stringify(dataPacking) },
            { where: { nroDespacho: nroDespacho } }
          );
        } catch (error) {
          console.log(error);
        }
      }
    }
  }
};

const procesaOcrSearaEstrategia2 = async (ocr, nroDespacho) => {
  var data = [];

  //Procesa FACTURA COMERCIAL
  //Se busca la pagina que contiene la factura comercial
  //Se busca la tabla que contiene los datos de la factura comercial
  //Se busca la linea que contiene la cantidad y el valor
  //Se busca la linea que contiene el codigo
  //Se guarda la cantidad, el valor y el codigo en el objeto item
  //Se guarda el array data en la base de datos

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("FACTURA COMERCIAL")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let textoLineaSiguiente = "";
      if (i < tabla.length - 1) {
        textoLineaSiguiente = tabla[i + 1].toUpperCase();
      }
      if (texto.includes("VALOR FCA") && textoLineaSiguiente.includes("NCM")) {
        let item = {
          cantidad: "0",
          codigo: "",
          descripcion: "",
          valor: "0",
          peso: "0",
          codigoInvalido: false,
        };

        let linea = tabla[i - 2].split("\t");

        item.cantidad = linea[0];
        item.valor = linea[linea.length - 2];

        let linea2 = tabla[i - 1].split("\t");

        let lineaConCodigo = linea2.join(" ").replace(/\r/g, "").split(" ");

        item.codigo = lineaConCodigo[lineaConCodigo.length - 2];

        item.codigoInvalido = await valCodigo(item.codigo);

        data.push(item);
      }
    }
  }

  if (data.length == 0) {
    console.log("No se encontraron datos en la factura comercial");
    //await procesaOcrSearaEstrategia2(ocr, nroDespacho);
  } else {
    try {
      await imp_importacion_archivo.update(
        { detalles: JSON.stringify(data) },
        { where: { nroDespacho: nroDespacho } }
      );
    } catch (error) {
      console.log(error);
    }
  }
};

const valCodigo = async (codigo) => {
  let existe = await imp_sku.findOne({
    where: { sku: codigo },
  });
  if (!existe) {
    return true;
  } else {
    return false;
  }
};

module.exports = procesaOcrSeara;
