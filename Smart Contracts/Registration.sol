//SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract Registration {

    address immutable owner;

    constructor () {
        owner = msg.sender;
    }

    modifier onlyOwner {
        require(msg.sender==owner, "Only owner can call this function");
        _;
    }

    modifier onlyRegInsuranceCompanies {
        require(regInsuranceCompanies[msg.sender], "Only registered insurance companies can call this function");
        _;
    }

    struct Clinician {
        bool registered;
        address hospital; 
    }

    struct Patient {
        bool registered;
        address insuranceCompany;
        uint256 mrn;
    }

    mapping (address=>Patient) public regPatients;
    mapping (address=>Clinician) public regClinicians;
    mapping (address=>bool) public regPharmacies;
    mapping (address=>bool) public regHospitals;
    mapping (address=>bool) public regInsuranceCompanies;

    event PatientRegistered(address patientAddress, address insuranceCompanyAddress, uint256 MRN, string gender, string birthDate);
    event ClinicianRegistered(address clinicianAddress, address hospitalAddress);
    event PharmacyRegistered(address pharmacyAddress);
    event HospitalRegistered(address hospitalAddress);
    event InsuranceCompanyRegistered(address insuranceCompanyAddress);


    function registerPatient(address patientAddress, address insuranceCompany, uint256 mrn, string memory gender, string memory birthDate) public onlyOwner{
        require(!regPatients[patientAddress].registered, "Patient is already registered");
        require(regInsuranceCompanies[insuranceCompany], "Insurance company is not registered");
        regPatients[patientAddress].registered = true;
        regPatients[patientAddress].insuranceCompany = insuranceCompany;
        regPatients[patientAddress].mrn = mrn;
        emit PatientRegistered(patientAddress, insuranceCompany, mrn, gender, birthDate);
    }

    function registerClinician(address clinicianAddress, address hospitalAddress) public onlyOwner{
        require(!regClinicians[clinicianAddress].registered, "Clinician is already registered");
        require(regHospitals[hospitalAddress], "Hospital is not registered");
        regClinicians[clinicianAddress].registered = true;
        regClinicians[clinicianAddress].hospital = hospitalAddress;
        emit ClinicianRegistered(clinicianAddress, hospitalAddress);
    }

    function registerPharmacy(address pharmacyAddress) public onlyOwner{
        require(!regPharmacies[pharmacyAddress], "Pharmacy is already registered");
        regPharmacies[pharmacyAddress] = true;
        emit PharmacyRegistered(pharmacyAddress);
    }

    function registerHospital(address hospitalAddress) public onlyOwner{
        require(!regHospitals[hospitalAddress], "Hospital is already registered");
        regHospitals[hospitalAddress] = true;
        emit HospitalRegistered(hospitalAddress);
    }

    function registerInsuranceCompany(address insuranceCompanyAddress) public onlyOwner{
        require(!regInsuranceCompanies[insuranceCompanyAddress], "Insurance company is already registered");
        regInsuranceCompanies[insuranceCompanyAddress] = true;
        emit InsuranceCompanyRegistered(insuranceCompanyAddress);
    }

    function isPatientRegistered(address patientAddress) public view returns (bool) {
        return regPatients[patientAddress].registered;
    }

    function isClinicianRegistered(address clinicianAddress) public view returns (bool) {
        return regClinicians[clinicianAddress].registered;
    }

    function getClinicianHospital(address clinicianAddress) public view returns (address) {
        return regClinicians[clinicianAddress].hospital;
    }

    function getPatientInsurance(address patientAddress) public view returns (address) {
        return regPatients[patientAddress].insuranceCompany;
    }

}
