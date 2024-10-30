//SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./Registration.sol";

contract InsuranceClaims {

    Registration immutable regSC;
    uint256 serviceId;
    uint256 prescriptionId;
    uint256 claimId;

    constructor (address regSCAddr) {
        regSC = Registration(regSCAddr);
        serviceId = 0;
        prescriptionId = 0;
        claimId = 0;
    }

    modifier onlyRegisteredClinicians {
        require(regSC.isClinicianRegistered(msg.sender), "Only registered clinicians can call this function");
        _;
    }

    modifier onlyRegisteredPharmacies {
        require(regSC.regPharmacies(msg.sender), "Only registered pharmacies can call this function");
        _;
    }

    modifier onlyRegisteredPatients(uint256 id) {
        require(services[id].patient == msg.sender || prescriptions[id].patient == msg.sender, "Only authorized patients can call this function");
        _;
    }

    modifier onlyRegisteredHospitals {
        require(regSC.regHospitals(msg.sender), "Only registered hospitals can call this function");
        _;
    }

    modifier onlyRegInsuranceCompanies(uint256 id) {
        require(claimRequests[id].insurance == msg.sender, "Only authorized insurance companies can call this function");
        _;
    }

    modifier onlyInsuranceLLM(uint256 id) {
        require((claimRequests[id].insurance == msg.sender || claimRequests[id].insurance == regSC.getLLMInsurance(msg.sender)), "Only authorized insurance companies can call this function");
        _;
    }

    enum ClaimStatus {Pending, Approved, Flagged, Rejected, Paid}

    struct Service {
        uint256 code;
        address clinician;
        uint256 cost;
        address patient;
        bool claimRequested;
    }

    struct Prescription {
        address pharmacy;
        uint256 code;
        address patient;
        bool dispensed;
        uint256 cost;
        bool claimRequested;
    }

    struct ClaimRequest {
        address caller;
        address insurance;
        address patient;
        ClaimStatus status;
        uint256 cost;
    }

    mapping (uint256=>Service) services;
    mapping (uint256=>Prescription) prescriptions;
    mapping (uint256=>ClaimRequest) claimRequests;

    event NewServiceAdded(address patientAddress, uint256 serviceId);
    event NewPrescriptionAdded(address patientAddress, uint256 prescriptionId);
    event PrescriptionDispensed(uint256 prescriptionId);
    event ClaimRequestSubmitted(uint256 claimId, address insuranceCompanyAddress);
    event ClaimRequestApproved(uint256 claimId);
    event ClaimRequestFlagged(uint256 claimId);
    event ClaimRequestPaid(uint256 claimId);
    event ClaimRequestRejected(uint256 claimId);
    event PatientPaidForService(address patientAddress, uint256 serviceId, uint256 paidAmount);
    event PatientPaidForPrescription(address patientAddress, uint256 prescriptionId, uint256 paidAmount);

    function addService(address patientAddress, uint256 serviceCPTCode, uint256 cost) public onlyRegisteredClinicians {
        require(regSC.isPatientRegistered(patientAddress), "Patient is not registered");
        services[serviceId] = Service({
            code: serviceCPTCode,
            clinician: msg.sender,
            cost: cost,
            patient: patientAddress,
            claimRequested: false
        });
        emit NewServiceAdded(patientAddress, serviceId);
        serviceId++;
    }


    function addPrescription(address patientAddress, uint256 medicationNDCCode) public onlyRegisteredClinicians{
        require(regSC.isPatientRegistered(patientAddress), "Patient is not registered");
        prescriptions[prescriptionId] = Prescription({
            pharmacy: address(0),
            code: medicationNDCCode,
            patient: patientAddress,
            dispensed: false,
            cost: 0,
            claimRequested: false
        });
        emit NewPrescriptionAdded(patientAddress, prescriptionId);
        prescriptionId++;
    }

    function dispensePrescription(uint256 prescriptionID, uint256 cost) public onlyRegisteredPharmacies {
        require(!prescriptions[prescriptionID].dispensed, "Prescription is already dispensed");
        prescriptions[prescriptionID].dispensed = true;
        prescriptions[prescriptionID].cost = cost;
        prescriptions[prescriptionID].pharmacy = msg.sender;
        emit PrescriptionDispensed(prescriptionID);
    }

    function submitClaimRequestByHospital(address patientAddress, uint256 cost, uint256 serviceID) public onlyRegisteredHospitals {
        require((regSC.getClinicianHospital(services[serviceID].clinician) == msg.sender), "Service was provided by clinician from other hospital");
        require(!services[serviceID].claimRequested, "Claim already requested for this service");
        require((cost <= services[serviceID].cost), "Claimed cost should be less than total cost");
        claimRequests[claimId] = ClaimRequest({
            caller: msg.sender,
            insurance: regSC.getPatientInsurance(patientAddress),
            patient: patientAddress,
            status: ClaimStatus.Pending,
            cost: cost
        });
        services[serviceID].claimRequested = true;
        emit ClaimRequestSubmitted(claimId, regSC.getPatientInsurance(patientAddress));
        claimId++;
    }

    function submitClaimRequestByPharmacy(address patientAddress, uint256 cost, uint256 prescriptionID) public onlyRegisteredPharmacies {
        require(!prescriptions[prescriptionID].claimRequested, "Claim already requested for this prescription");        
        require(prescriptions[prescriptionID].dispensed, "Prescription is not dispensed to patient");        
        require((cost <= prescriptions[prescriptionID].cost), "Claimed cost should be less than total cost");
        claimRequests[claimId] = ClaimRequest({
            caller: msg.sender,
            insurance: regSC.getPatientInsurance(patientAddress),
            patient: patientAddress,
            status: ClaimStatus.Pending,
            cost: cost
        });
        prescriptions[prescriptionID].claimRequested = true;
        emit ClaimRequestSubmitted(claimId, regSC.getPatientInsurance(patientAddress));
        claimId++;
    }

    function approveClaimRequest(uint256 claimID) public onlyRegInsuranceCompanies(claimID) {
        claimRequests[claimID].status = ClaimStatus.Approved;
        emit ClaimRequestApproved(claimID);
    }

    function flagClaimRequest(uint256 claimID) public onlyInsuranceLLM(claimID) {
        claimRequests[claimID].status = ClaimStatus.Flagged;
        emit ClaimRequestFlagged(claimID);
    }

    function rejectClaimRequest(uint256 claimID) public onlyRegInsuranceCompanies(claimID) {
        claimRequests[claimID].status = ClaimStatus.Flagged;
        emit ClaimRequestRejected(claimID);
    }

    function payClaim(address payable receiver, uint256 claimID) public onlyRegInsuranceCompanies(claimID) payable { 
        require((claimRequests[claimID].status == ClaimStatus.Approved), "Claim request is not approved");
        require((msg.value == claimRequests[claimID].cost * 1 ether), "Ether amount should be equal to claim cost");
        require((receiver == claimRequests[claimID].caller), "Claim was submitted by other caller");
        claimRequests[claimID].status = ClaimStatus.Paid;
        emit ClaimRequestPaid(claimID);
        receiver.transfer(msg.value);
    }

    function payForServiceByPatient(uint256 serviceID, address payable receiver) public onlyRegisteredPatients(serviceID) payable {
        require((msg.value <= services[serviceID].cost * 1 ether), "Ether amount should not be more than total cost");
        require((regSC.getClinicianHospital(services[serviceID].clinician) == receiver), "Service was provided by clinician from other hospital");
        emit PatientPaidForService(msg.sender, serviceID, msg.value);
        receiver.transfer(msg.value);
    }

    function payForPrescriptionByPatient(uint256 prescriptionID, address payable receiver) public onlyRegisteredPatients(prescriptionID) payable {
        require((msg.value <= prescriptions[prescriptionID].cost * 1 ether), "Ether amount should not be more than total cost");
        require((receiver == prescriptions[prescriptionID].pharmacy), "Claim was submitted by other caller");
        emit PatientPaidForPrescription(msg.sender, prescriptionID, msg.value);
        receiver.transfer(msg.value);
    }

    function getPendingClaims() public view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < claimId; i++) {
            if (claimRequests[i].status == ClaimStatus.Pending) {
                count++;
            }
        }
        uint256[] memory pendingClaimIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < claimId; i++) {
            if (claimRequests[i].status == ClaimStatus.Pending) {
                pendingClaimIds[index] = i;
                index++;
            }
        }
        return pendingClaimIds;
    }

    function getFlaggedClaims() public view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < claimId; i++) {
            if (claimRequests[i].status == ClaimStatus.Flagged) {
                count++;
            }
        }
        uint256[] memory flaggedClaimIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < claimId; i++) {
            if (claimRequests[i].status == ClaimStatus.Flagged) {
                flaggedClaimIds[index] = i;
                index++;
            }
        }
        return flaggedClaimIds;
    }

    function getClaimStatus(uint256 id) public view returns (ClaimStatus) {
        return(claimRequests[id].status);
    }

}
