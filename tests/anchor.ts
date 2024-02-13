import assert from "assert";
import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { SystemProgram, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAccount, createAssociatedTokenAccount, createMint, mintTo, mintToChecked } from "@solana/spl-token";
import type { HadesPayment } from "../target/types/hades_payment";
import * as bs58 from "bs58";

interface DepositInfo {
  wallet: PublicKey;     // Wallet information associated with the deposit
  deposit_index: number; // Deposit index information
  from: PublicKey;       // Sender's token account
  to: PublicKey;         // Receiver's token account (contract's account)
  amount: number;        // Amount of tokens deposited
}

interface Withdrawal {
  from: PublicKey;    // Sender's token account (contract's account)
  to: PublicKey;      // Receiver's token account
  amount: number;     // Amount of tokens withdrawn
  uid: number;        // Withdrawal UID
  message: string;    // Withdrawal message
}

interface MyState {
  deposits: DepositInfo[];
  withdrawals: Withdrawal[];
  authorizedAddresses: PublicKey[];
  depositIndex: number;
  uid: number;
}

describe("Test", () => {
  let connection: web3.Connection;
  let program: anchor.Program<HadesPayment>;
  let mystate = anchor.web3.Keypair.generate();
  let authority = anchor.web3.Keypair.generate();

  before(async () => {
    // Connect to the local Solana cluster
    connection = new web3.Connection("http://localhost:8899", "confirmed");
    // Configure the client to use the local cluster
    anchor.setProvider(anchor.AnchorProvider.env());
    // Initialize the HadesPayment program
    program = anchor.workspace.HadesPayment as anchor.Program<HadesPayment>;

  });

  it("Initializes MyState account", async () => {
    await connection.requestAirdrop(authority.publicKey, web3.LAMPORTS_PER_SOL);
    await connection.requestAirdrop(mystate.publicKey, web3.LAMPORTS_PER_SOL);


    // Wait for the airdrop to be confirmed
    await sleep(2000); // Adjust the wait time as needed

    // Initialize MyState account
    try {
      const tx = await program.rpc.initialize({
        accounts: {
          mystate: mystate.publicKey,
          signer: authority.publicKey,
          systemProgram: SystemProgram.programId,
        },
        signers: [authority, mystate], // Both mystate and authority are signers
      });
      console.log("Initialize success: tx ->: ", tx);
  
      // Fetch the initialized MyState account
      const myStateAccount : MyState = await program.account.myState.fetch(mystate.publicKey);
      console.log("state account was created successfully: ");

      console.log("current DepositInfo's array is like that ->", myStateAccount.deposits);
      console.log("current withdrawals's array is like that ->", myStateAccount.withdrawals);
      console.log("current authorizedAddresses's array is like that ->", myStateAccount.authorizedAddresses);
      console.log("current depositIndex is like that ->", myStateAccount.depositIndex);
      console.log("current uid is like that ->", myStateAccount.uid);
    } catch (error) {
      console.log(error);
    }
   
  });

  it("Should add and remove authorized addresses correctly", async () => {
    // Generate keypairs for the authority and new authorized address
    const newAddress = Keypair.generate();
     // Add the new address as an authorized address
     await program.rpc.addAuthorizedAddress(newAddress.publicKey, {
      accounts: {
        mystate: mystate.publicKey,
        authority: authority.publicKey,
      },
      signers: [authority],
    });


    // Fetch the updated MyState account
    const updatedMyState = await program.account.myState.fetch(mystate.publicKey);
    console.log("After add authorized address ->",updatedMyState.authorizedAddresses);

    // Check if the new address is added as an authorized address
    assert(updatedMyState.authorizedAddresses.length == 2);

    // Remove the new address from the authorized addresses
    await program.rpc.removeAuthorizedAddress(newAddress.publicKey, {
      accounts: {
        mystate: mystate.publicKey,
        authority: authority.publicKey,
      },
      signers: [authority],
    });

    // Fetch the updated MyState account again
    const finalMyState = await program.account.myState.fetch(mystate.publicKey);

    // Check if the new address is removed from the authorized addresses
    console.log("Delete authorized address -> ", updatedMyState.authorizedAddresses);

    assert(finalMyState.authorizedAddresses.length == 1);
  });

  it("Deposit SOL from users to the contract's account", async () => {
    // Generate a new keypair for the account depositing lamports
    const fromAccount = Keypair.generate();

    // Generate a new keypair for the destination account
    const toAccount = Keypair.generate();

    // Request an airdrop for the account depositing lamports
    await connection.requestAirdrop(fromAccount.publicKey, 1000000000);

    // Wait for the airdrop to be confirmed
    await sleep(2000); // Adjust the wait time as needed

    // Get the balance of the destination account before the deposit
     const initialBalance = await connection.getBalance(toAccount.publicKey);
     console.log("This is the balance of the destination account before the deposit : ", initialBalance / web3.LAMPORTS_PER_SOL);

    // Define the amount of lamports to deposit
    const amount = 100000000;
    // Deposit lamports into MyState account
    const txHash = await program.rpc.depositLamports(new anchor.BN(amount),fromAccount.publicKey, {
      accounts: {
        from: fromAccount.publicKey,
        to: toAccount.publicKey,
        mystate: mystate.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [fromAccount],
    });
    // Confirm the transaction
    await connection.confirmTransaction(txHash);
    console.log("user deposited ", amount / web3.LAMPORTS_PER_SOL, " SOL");
    

    // Get the balance of the destination account after the deposit
    const finalBalance = await connection.getBalance(toAccount.publicKey);
    console.log("This is the balance of the destination account after the deposit : ", finalBalance / web3.LAMPORTS_PER_SOL);

    // Assert that the destination account received the deposited lamports
    assert.strictEqual(
      (finalBalance - initialBalance)/web3.LAMPORTS_PER_SOL,
      amount/web3.LAMPORTS_PER_SOL,
      "The destination account should receive the deposited lamports"
    );

    // Fetch the initialized MyState account
    const myStateAccount : MyState = await program.account.myState.fetch(mystate.publicKey);
    console.log("state account was created successfully: ");

    console.log("current DepositInfo's array is like that ->", myStateAccount.deposits);
    console.log("current withdrawals's array is like that ->", myStateAccount.withdrawals);
    console.log("current authorizedAddresses's array is like that ->", myStateAccount.authorizedAddresses);
    console.log("current depositIndex is like that ->", myStateAccount.depositIndex);
    console.log("current uid is like that ->", myStateAccount.uid);

  });

  it("Withdraw SOL from contract's account to the user", async () => {
    // Generate a new keypair for the account depositing lamports
    const fromAccount = Keypair.generate();

    // Generate a new keypair for the destination account
    const toAccount = Keypair.generate();

    // Request an airdrop for the account depositing lamports
    await connection.requestAirdrop(fromAccount.publicKey, 1000000000);

    // Wait for the airdrop to be confirmed
    await sleep(2000); // Adjust the wait time as needed

    // Get the balance of the destination account before the deposit
     const initialBalance = await connection.getBalance(toAccount.publicKey);
     console.log("This is the balance of the destination account before the deposit : ", initialBalance / web3.LAMPORTS_PER_SOL);

    // Define the amount of lamports to deposit
    const amount = 100000000;
    // Withdraw lamports from MyState account to user
    try {
      await program.rpc.withdrawLamports(new anchor.BN(amount),"success", {
        accounts: {
          from: fromAccount.publicKey,
          to: toAccount.publicKey,
          mystate: mystate.publicKey,
          authority:authority.publicKey,
          systemProgram: SystemProgram.programId,
        },
        signers: [fromAccount, authority],
      });
      console.log("user withdrawed ", amount / web3.LAMPORTS_PER_SOL, " SOL");
    } catch (error) {
      console.log(error);
    }

    await sleep(2000); // Adjust the wait time as needed

   
    // Get the balance of the destination account after the deposit
    const finalBalance = await connection.getBalance(toAccount.publicKey);
    console.log("This is the balance of the user account after the withdraw : ", finalBalance / web3.LAMPORTS_PER_SOL);

    // Assert that the destination account received the deposited lamports
    assert.strictEqual(
      (finalBalance - initialBalance)/web3.LAMPORTS_PER_SOL,
      amount/web3.LAMPORTS_PER_SOL,
      "The destination account should receive the deposited lamports"
    );

    // Fetch the initialized MyState account
    const myStateAccount : MyState = await program.account.myState.fetch(mystate.publicKey);
    console.log("state account was created successfully: ");

    console.log("current DepositInfo's array is like that ->", myStateAccount.deposits);
    console.log("current withdrawals's array is like that ->", myStateAccount.withdrawals);
    console.log("current authorizedAddresses's array is like that ->", myStateAccount.authorizedAddresses);
    console.log("current depositIndex is like that ->", myStateAccount.depositIndex);
    console.log("current uid is like that ->", myStateAccount.uid);

  });

  it("Deposits SPL tokens into the contract's account", async () => {
    // Generate a new keypair for the account depositing SPL tokens
    const fromAccount = Keypair.generate();

    // Generate a new keypair for the destination account
    const toAccount = Keypair.generate();
    
    await connection.requestAirdrop(fromAccount.publicKey, 1000000000);


    await sleep(2000); // Adjust the wait time as needed
    const feePayer = program.provider.wallet.payer;

    // Create a new SPL token
    let mintPubkey = await createMint(
      connection, // conneciton
      feePayer, // fee payer
      feePayer.publicKey, // mint authority
      null, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
      0 // decimals
    );
    console.log(`mint: ${mintPubkey.toBase58()}`);

    // Create token accounts for the from and to accounts
    const fromAta = await createAssociatedTokenAccount(
      connection,
      feePayer,
      mintPubkey,
      fromAccount.publicKey
    );
    const toAta = await createAssociatedTokenAccount(
      connection,
      feePayer,
      mintPubkey,
      toAccount.publicKey
    );
    // Mint tokens to the 'from' associated token account
    const mintAmount = 1000;
    try {
      const tx = await mintToChecked(
        connection,
        feePayer,
        mintPubkey,
        fromAta,
        feePayer,
        mintAmount,
        0
      );
      console.log(tx);
    } catch (error) {
      console.log(error);
    }
    
    const fromTokenAccount = await connection.getTokenAccountBalance(fromAta);
    console.log("minted ",mintPubkey, "->",fromTokenAccount.value.uiAmount," to -> ", fromAccount.publicKey);
    // Send transaction
    const transferAmount = 500;

    await program.rpc.depositSpl(new anchor.BN(transferAmount),fromAccount.publicKey, {
      accounts: {
        from: fromAccount.publicKey,
        fromAta: fromAta,
        toAta: toAta,
        mystate: mystate.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [feePayer, fromAccount],
    });
    await sleep(2000); // Adjust the wait time as needed

    
    // console.log("txHash->", txHash);

    const toTokenAccount = await connection.getTokenAccountBalance(toAta);
    assert.strictEqual(
      toTokenAccount.value.uiAmount,
      transferAmount,
      "The 'to' token account should have the transferred tokens"
    );
     // Fetch the initialized MyState account
     const myStateAccount : MyState = await program.account.myState.fetch(mystate.publicKey);
     console.log("state account was created successfully: ");
 
     console.log("current DepositInfo's array is like that ->", myStateAccount.deposits);
     console.log("current withdrawals's array is like that ->", myStateAccount.withdrawals);
     console.log("current authorizedAddresses's array is like that ->", myStateAccount.authorizedAddresses);
     console.log("current depositIndex is like that ->", myStateAccount.depositIndex);
     console.log("current uid is like that ->", myStateAccount.uid);
 
  });
  it("Withdraw SPL tokens into the contract's account", async () => {
    // Generate a new keypair for the account depositing SPL tokens
    const fromAccount = Keypair.generate();

    // Generate a new keypair for the destination account
    const toAccount = Keypair.generate();
    
    await connection.requestAirdrop(fromAccount.publicKey, 1000000000);


    await sleep(2000); // Adjust the wait time as needed
    const feePayer = program.provider.wallet.payer;

    // Create a new SPL token
    let mintPubkey = await createMint(
      connection, // conneciton
      feePayer, // fee payer
      feePayer.publicKey, // mint authority
      null, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
      0 // decimals
    );
    console.log(`mint: ${mintPubkey.toBase58()}`);

    // Create token accounts for the from and to accounts
    const fromAta = await createAssociatedTokenAccount(
      connection,
      feePayer,
      mintPubkey,
      fromAccount.publicKey
    );
    const toAta = await createAssociatedTokenAccount(
      connection,
      feePayer,
      mintPubkey,
      toAccount.publicKey
    );
    // Mint tokens to the 'from' associated token account
    const mintAmount = 1000;
    try {
      const tx = await mintToChecked(
        connection,
        feePayer,
        mintPubkey,
        fromAta,
        feePayer,
        mintAmount,
        0
      );
      console.log(tx);
    } catch (error) {
      console.log(error);
    }
    
    const fromTokenAccount = await connection.getTokenAccountBalance(fromAta);
    console.log("minted ",mintPubkey, "->",fromTokenAccount.value.uiAmount," to -> ", fromAccount.publicKey);
    // Send transaction
    const transferAmount = 500;

    await program.rpc.withdrawSpl(new anchor.BN(transferAmount),"success withdraw spl", {
      accounts: {
        from: fromAccount.publicKey,
        fromAta: fromAta,
        toAta: toAta,
        mystate: mystate.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [feePayer, fromAccount, authority],
    });
    await sleep(2000); // Adjust the wait time as needed

    
    // console.log("txHash->", txHash);

    const toTokenAccount = await connection.getTokenAccountBalance(toAta);
    assert.strictEqual(
      toTokenAccount.value.uiAmount,
      transferAmount,
      "The 'to' token account should have the transferred tokens"
    );
     // Fetch the initialized MyState account
     const myStateAccount : MyState = await program.account.myState.fetch(mystate.publicKey);
     console.log("state account was created successfully: ");
 
     console.log("current DepositInfo's array is like that ->", myStateAccount.deposits);
     console.log("current withdrawals's array is like that ->", myStateAccount.withdrawals);
     console.log("current authorizedAddresses's array is like that ->", myStateAccount.authorizedAddresses);
     console.log("current depositIndex is like that ->", myStateAccount.depositIndex);
     console.log("current uid is like that ->", myStateAccount.uid);
 
  });
});


// Utility function to sleep for a specified duration
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
